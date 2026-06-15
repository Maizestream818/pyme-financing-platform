import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { Injectable, StreamableFile } from '@nestjs/common';
import {
  ApplicationDocument,
  DocumentRequirement,
  DocumentStatus,
  FinancingApplication,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { validateUploadedFile } from '../../common/files/file-validation';
import { UploadedFile } from '../../common/files/uploaded-file';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReviewApplicationDocumentDto } from './dto/review-application-document.dto';

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

type DocumentWithRequirement = ApplicationDocument & {
  documentRequirement: DocumentRequirement;
};

type DocumentWithApplication = ApplicationDocument & {
  application: FinancingApplication & {
    company: {
      applicantUserId: string | null;
    };
  };
  documentRequirement: DocumentRequirement;
};

type DownloadResponse = {
  setHeader: (name: string, value: string) => void;
};

const REVIEWABLE_STATUSES: DocumentStatus[] = [
  'approved',
  'rejected',
  'not_applicable',
];

@Injectable()
export class ApplicationDocumentsService {
  private readonly uploadsRoot = resolveUploadsRoot();

  constructor(private readonly prisma: PrismaService) {}

  async initializeChecklist(applicationId: string, user: AuthenticatedUser) {
    const application = await this.findAccessibleApplication(applicationId, user);

    const requirements = await this.prisma.documentRequirement.findMany({
      where: {
        isActive: true,
        OR: [{ appliesTo: null }, { appliesTo: application.needType }],
        AND: [
          {
            OR: [
              { appliesToBusinessType: null },
              { appliesToBusinessType: application.company.businessType },
            ],
          },
        ],
      },
      orderBy: { name: 'asc' },
    });

    if (requirements.length > 0) {
      await this.prisma.applicationDocument.createMany({
        data: requirements.map((requirement) => ({
          applicationId,
          documentRequirementId: requirement.id,
          status: 'pending' as const,
        })),
        skipDuplicates: true,
      });
    }

    return this.findByApplication(applicationId, user);
  }

  async findByApplication(applicationId: string, user: AuthenticatedUser) {
    await this.findAccessibleApplication(applicationId, user);

    const documents = await this.prisma.applicationDocument.findMany({
      where: { applicationId },
      include: { documentRequirement: true },
      orderBy: { documentRequirement: { name: 'asc' } },
    });

    return documents.map((document) => this.toResponse(document, user));
  }

  async upload(
    documentId: string,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const document = await this.findAccessibleDocument(documentId, user);

    if (document.application.status === 'closed') {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'No se puede cargar documento en una solicitud cerrada.',
        [{ field: 'status', issue: 'closed' }],
      );
    }

    if (!['pending', 'rejected'].includes(document.status)) {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'El documento no esta en un estado que permita carga.',
        [{ field: 'status', issue: `cannot_upload_from_${document.status}` }],
      );
    }

    const validation = validateUploadedFile(file);
    const buffer = file?.buffer;

    if (!buffer) {
      throw this.documentUploadError('file', 'missing_buffer');
    }

    const isReplacement = document.status === 'rejected';
    const storedFilename = `${randomUUID()}${validation.extension}`;
    const applicationDirectory = join(
      this.uploadsRoot,
      'applications',
      document.applicationId,
    );
    const absolutePath = join(applicationDirectory, storedFilename);
    const relativePath = join(
      'uploads',
      'applications',
      document.applicationId,
      storedFilename,
    ).replace(/\\/g, '/');
    const fileHashSha256 = createHash('sha256').update(buffer).digest('hex');
    const uploadedAt = new Date();
    const oldFilePath = document.filePath;

    try {
      await mkdir(applicationDirectory, { recursive: true });
      await writeFile(absolutePath, buffer, { flag: 'wx' });
    } catch {
      throw this.documentUploadError('file', 'filesystem_write_failed');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.applicationDocument.update({
          where: { id: documentId },
          data: {
            status: 'uploaded',
            filePath: relativePath,
            storedFilename,
            originalFilename: validation.safeOriginalFilename,
            mimeType: file.mimetype,
            fileSizeBytes: BigInt(file.size),
            fileHashSha256,
            notes: null,
            uploadedByUserId: user.id,
            uploadedAt,
            reviewedByUserId: null,
            reviewedAt: null,
          },
          include: { documentRequirement: true },
        });

        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: isReplacement ? 'replace_document' : 'upload_document',
            entityName: 'application_documents',
            entityId: documentId,
            oldValues: isReplacement
              ? {
                  status: document.status,
                  fileHashSha256: document.fileHashSha256,
                  originalFilename: document.originalFilename,
                }
              : undefined,
            newValues: {
              status: 'uploaded',
              originalFilename: validation.safeOriginalFilename,
              mimeType: file.mimetype,
              fileSizeBytes: file.size,
              fileHashSha256,
            },
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
          },
        });

        return saved;
      });

      if (isReplacement && oldFilePath) {
        await this.deleteStoredFileIfExists(oldFilePath);
      }

      return this.toResponse(updated, user);
    } catch {
      await this.deleteStoredFileIfExists(relativePath);
      throw this.documentUploadError('metadata', 'persistence_failed');
    }
  }

  async review(
    documentId: string,
    dto: ReviewApplicationDocumentDto,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const document = await this.findDocumentForOperator(documentId);

    if (!REVIEWABLE_STATUSES.includes(dto.status)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Estado de revision documental invalido.',
        [{ field: 'status', issue: 'review_status_not_allowed' }],
      );
    }

    if (
      ['approved', 'rejected'].includes(dto.status) &&
      (!document.filePath || !document.uploadedAt)
    ) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'No se puede aprobar o rechazar un documento sin archivo.',
        [{ field: 'file', issue: 'required_before_review' }],
      );
    }

    if (dto.status === 'rejected' && !dto.notes?.trim()) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El rechazo documental requiere motivo.',
        [{ field: 'notes', issue: 'required_when_rejected' }],
      );
    }

    const reviewedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.applicationDocument.update({
        where: { id: documentId },
        data: {
          status: dto.status,
          notes: dto.notes?.trim() || null,
          reviewedByUserId: user.id,
          reviewedAt,
        },
        include: { documentRequirement: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'review_document',
          entityName: 'application_documents',
          entityId: documentId,
          oldValues: {
            status: document.status,
            notes: document.notes,
          },
          newValues: {
            status: dto.status,
            notes: dto.notes?.trim() || null,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });

      return saved;
    });

    return this.toResponse(updated, user);
  }

  async download(
    documentId: string,
    user: AuthenticatedUser,
    response: DownloadResponse,
  ) {
    const document = await this.findAccessibleDocument(documentId, user);

    if (!document.filePath || !document.originalFilename || !document.mimeType) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'El documento no tiene archivo disponible.',
      );
    }

    const absolutePath = this.absolutePathFromStoredPath(document.filePath);

    try {
      await stat(absolutePath);
    } catch {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'El archivo solicitado no esta disponible.',
      );
    }

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${basename(document.originalFilename)}"`,
    );

    return new StreamableFile(createReadStream(absolutePath));
  }

  private async findAccessibleApplication(
    applicationId: string,
    user: AuthenticatedUser,
  ) {
    const application = await this.prisma.financingApplication.findFirst({
      where: {
        id: applicationId,
        ...(user.role === 'applicant'
          ? { company: { applicantUserId: user.id } }
          : {}),
      },
      include: { company: true },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }

    return application;
  }

  private async findAccessibleDocument(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<DocumentWithApplication> {
    const document = await this.prisma.applicationDocument.findFirst({
      where: {
        id: documentId,
        ...(user.role === 'applicant'
          ? { application: { company: { applicantUserId: user.id } } }
          : {}),
      },
      include: {
        application: { include: { company: { select: { applicantUserId: true } } } },
        documentRequirement: true,
      },
    });

    if (!document) {
      throw new ApiException(404, 'NOT_FOUND', 'Documento no encontrado.');
    }

    return document;
  }

  private async findDocumentForOperator(documentId: string) {
    const document = await this.prisma.applicationDocument.findUnique({
      where: { id: documentId },
      include: { documentRequirement: true },
    });

    if (!document) {
      throw new ApiException(404, 'NOT_FOUND', 'Documento no encontrado.');
    }

    return document;
  }

  private async deleteStoredFileIfExists(storedPath: string) {
    const absolutePath = this.absolutePathFromStoredPath(storedPath);

    try {
      await unlink(absolutePath);
    } catch {
      // Best-effort cleanup; metadata no longer points to this file.
    }
  }

  private absolutePathFromStoredPath(storedPath: string) {
    const normalized = storedPath.replace(/\\/g, '/');
    const prefix = 'uploads/';

    if (!normalized.startsWith(prefix)) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'El archivo solicitado no esta disponible.',
      );
    }

    return join(this.uploadsRoot, normalized.slice(prefix.length));
  }

  private documentUploadError(field: string, issue: string) {
    return new ApiException(
      500,
      'DOCUMENT_UPLOAD_ERROR',
      'No se pudo guardar el documento.',
      [{ field, issue }],
    );
  }

  private toResponse(
    document: DocumentWithRequirement,
    user: AuthenticatedUser,
  ) {
    const base = {
      id: document.id,
      applicationId: document.applicationId,
      documentRequirementId: document.documentRequirementId,
      requirement: {
        id: document.documentRequirement.id,
        name: document.documentRequirement.name,
        description: document.documentRequirement.description,
        isRequired: document.documentRequirement.isRequired,
        appliesTo: document.documentRequirement.appliesTo,
        appliesToBusinessType:
          document.documentRequirement.appliesToBusinessType,
      },
      status: document.status,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes?.toString() ?? null,
      fileHashSha256: document.fileHashSha256,
      notes: document.notes,
      uploadedAt: document.uploadedAt,
      reviewedAt: document.reviewedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };

    if (user.role === 'internal_operator') {
      return {
        ...base,
        storedFilename: document.storedFilename,
        uploadedByUserId: document.uploadedByUserId,
        reviewedByUserId: document.reviewedByUserId,
      };
    }

    return base;
  }
}

function resolveUploadsRoot() {
  const configuredUploadsRoot = process.env.UPLOADS_DIR;

  if (configuredUploadsRoot) {
    return resolve(configuredUploadsRoot);
  }

  const candidates = [
    join(process.cwd(), 'uploads'),
    join(process.cwd(), '..', '..', 'uploads'),
  ];

  return resolve(candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]);
}
