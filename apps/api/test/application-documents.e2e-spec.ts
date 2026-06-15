import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mkdir, rm, stat } from 'fs/promises';
import { join, resolve } from 'path';
import request from 'supertest';
import { MAX_UPLOAD_SIZE_BYTES } from '../src/common/files/file-validation';
import { AppModule } from '../src/app.module';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://pyme:pyme_local_password@localhost:5432/pyme_financing_test?schema=public';

const DEMO_PASSWORD = 'Password123!';

describe('Documentos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantAToken: string;
  let applicantBToken: string;
  let applicantAId: string;
  let applicantBId: string;
  let applicationAId: string;
  let applicationBId: string;
  let uploadDocumentId: string;
  let invalidExtensionDocumentId: string;
  let largeFileDocumentId: string;
  let reviewWithoutFileDocumentId: string;
  let replacementDocumentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_4';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetDocumentData();
    await seedDocumentData();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    operatorToken = await login('operador@demo.com');
    applicantAToken = await login('applicant-a@demo.com');
    applicantBToken = await login('applicant-b@demo.com');
  });

  afterAll(async () => {
    await cleanupUploadDirectory(applicationAId);
    await cleanupUploadDirectory(applicationBId);
    await resetDocumentData();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('inicializa checklist con requisitos activos y aplicables sin duplicar', async () => {
    const initialized = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/documents/initialize`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(201);

    expect(initialized.body.success).toBeUndefined();
    expect(initialized.body.data).toHaveLength(5);
    expect(
      initialized.body.data.map(
        (item: { requirement: { name: string } }) => item.requirement.name,
      ),
    ).toEqual([
      'Comprobante de domicilio',
      'Constancia fiscal',
      'Estados de cuenta',
      'Identificacion oficial',
      'Solicitud firmada',
    ]);

    const repeated = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/documents/initialize`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(201);

    expect(repeated.body.data).toHaveLength(5);

    const documents = await prisma.applicationDocument.findMany({
      where: { applicationId: applicationAId },
      orderBy: { documentRequirement: { name: 'asc' } },
      include: { documentRequirement: true },
    });

    expect(documents).toHaveLength(5);
    uploadDocumentId = documents[0].id;
    invalidExtensionDocumentId = documents[1].id;
    largeFileDocumentId = documents[2].id;
    reviewWithoutFileDocumentId = documents[3].id;
    replacementDocumentId = documents[4].id;
  });

  it('bloquea acceso cruzado entre applicants', async () => {
    await request(app.getHttpServer())
      .post(`/api/applications/${applicationBId}/documents/initialize`)
      .set('Authorization', `Bearer ${applicantBToken}`)
      .expect(201);

    const listForbidden = await request(app.getHttpServer())
      .get(`/api/applications/${applicationBId}/documents`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(listForbidden.body.error.code).toBe('FORBIDDEN');

    const uploadForbidden = await request(app.getHttpServer())
      .post(`/api/application-documents/${uploadDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantBToken}`)
      .attach('file', validPdf('ajeno'), {
        filename: 'ajeno.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    expect(uploadForbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('sube PDF valido, guarda metadatos y no expone ruta local', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/application-documents/${uploadDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .attach('file', validPdf('identificacion'), {
        filename: 'identificacion.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      id: uploadDocumentId,
      status: 'uploaded',
      originalFilename: 'identificacion.pdf',
      mimeType: 'application/pdf',
    });
    expect(response.body.data.filePath).toBeUndefined();
    expect(response.body.data.fileHashSha256).toHaveLength(64);

    const saved = await prisma.applicationDocument.findUniqueOrThrow({
      where: { id: uploadDocumentId },
    });

    expect(saved.filePath).toContain(`uploads/applications/${applicationAId}/`);
    expect(saved.storedFilename).toMatch(/^[0-9a-f-]+\.pdf$/);
    expect(saved.uploadedByUserId).toBe(applicantAId);
    expect(saved.reviewedByUserId).toBeNull();
    expect(saved.reviewedAt).toBeNull();
    expect(saved.fileSizeBytes?.toString()).toBe(
      validPdf('identificacion').length.toString(),
    );

    await expectStoredFileExists(saved.filePath);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'upload_document',
        entityName: 'application_documents',
        entityId: uploadDocumentId,
      },
    });

    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.newValues)).not.toContain('%PDF');
  });

  it('rechaza extension invalida con FILE_VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/application-documents/${invalidExtensionDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .attach('file', Buffer.from('contenido invalido'), {
        filename: 'archivo.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);

    expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
  });

  it('rechaza archivo demasiado grande con FILE_VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/application-documents/${largeFileDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .attach('file', Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1, 1), {
        filename: 'grande.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(response.body.error.code).toBe('FILE_VALIDATION_ERROR');
  });

  it('permite revision solo operador y no aprueba documento sin archivo', async () => {
    const forbidden = await request(app.getHttpServer())
      .patch(`/api/application-documents/${uploadDocumentId}/review`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        status: 'approved',
      })
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const missingFile = await request(app.getHttpServer())
      .patch(`/api/application-documents/${reviewWithoutFileDocumentId}/review`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: 'approved',
      })
      .expect(400);

    expect(missingFile.body.error.code).toBe('VALIDATION_ERROR');

    const approved = await request(app.getHttpServer())
      .patch(`/api/application-documents/${uploadDocumentId}/review`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: 'approved',
        notes: 'Documento legible.',
      })
      .expect(200);

    expect(approved.body.data).toMatchObject({
      id: uploadDocumentId,
      status: 'approved',
      notes: 'Documento legible.',
    });
    expect(approved.body.data.reviewedByUserId).toBeDefined();

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'review_document',
        entityName: 'application_documents',
        entityId: uploadDocumentId,
      },
    });

    expect(audit).not.toBeNull();
  });

  it('descarga archivo protegido desde backend sin exponer ruta local', async () => {
    const forbidden = await request(app.getHttpServer())
      .get(`/api/application-documents/${uploadDocumentId}/download`)
      .set('Authorization', `Bearer ${applicantBToken}`)
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const response = await request(app.getHttpServer())
      .get(`/api/application-documents/${uploadDocumentId}/download`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      'filename="identificacion.pdf"',
    );
  });

  it('reemplaza documento rejected en el mismo application_document y limpia revision', async () => {
    await request(app.getHttpServer())
      .post(`/api/application-documents/${replacementDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .attach('file', validPdf('original'), {
        filename: 'solicitud-original.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/application-documents/${replacementDocumentId}/review`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: 'rejected',
        notes: 'Falta firma visible.',
      })
      .expect(200);

    const rejected = await prisma.applicationDocument.findUniqueOrThrow({
      where: { id: replacementDocumentId },
    });

    const replaced = await request(app.getHttpServer())
      .post(`/api/application-documents/${replacementDocumentId}/upload`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .attach('file', validPdf('reemplazo'), {
        filename: 'solicitud-reemplazo.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(replaced.body.data).toMatchObject({
      id: replacementDocumentId,
      status: 'uploaded',
      originalFilename: 'solicitud-reemplazo.pdf',
      notes: null,
    });
    expect(replaced.body.data.reviewedByUserId).toBeUndefined();

    const updated = await prisma.applicationDocument.findUniqueOrThrow({
      where: { id: replacementDocumentId },
    });
    const count = await prisma.applicationDocument.count({
      where: {
        applicationId: applicationAId,
        documentRequirementId: updated.documentRequirementId,
      },
    });

    expect(count).toBe(1);
    expect(updated.id).toBe(replacementDocumentId);
    expect(updated.status).toBe('uploaded');
    expect(updated.reviewedByUserId).toBeNull();
    expect(updated.reviewedAt).toBeNull();
    expect(updated.notes).toBeNull();
    expect(updated.fileHashSha256).not.toBe(rejected.fileHashSha256);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'replace_document',
        entityName: 'application_documents',
        entityId: replacementDocumentId,
      },
    });

    expect(audit).not.toBeNull();
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetDocumentData() {
    await prisma.auditLog.deleteMany();
    await prisma.applicationDecision.deleteMany();
    await prisma.applicationMatch.deleteMany();
    await prisma.riskAssessment.deleteMany();
    await prisma.applicationDocument.deleteMany();
    await prisma.documentRequirement.deleteMany();
    await prisma.applicationStatusHistory.deleteMany();
    await prisma.financingApplication.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  }

  async function seedDocumentData() {
    const [internalOperatorRole, applicantRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: 'internal_operator',
          description: 'Operador interno de pruebas.',
          isActive: true,
        },
      }),
      prisma.role.create({
        data: {
          name: 'applicant',
          description: 'Applicant de pruebas.',
          isActive: true,
        },
      }),
    ]);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const operator = await prisma.user.create({
      data: {
        roleId: internalOperatorRole.id,
        fullName: 'Operador Demo',
        email: 'operador@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    const applicantA = await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Applicant A',
        email: 'applicant-a@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    const applicantB = await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Applicant B',
        email: 'applicant-b@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    applicantAId = applicantA.id;
    applicantBId = applicantB.id;

    await prisma.documentRequirement.createMany({
      data: [
        {
          name: 'Comprobante de domicilio',
          description: 'General aplicable.',
          isRequired: true,
          isActive: true,
        },
        {
          name: 'Constancia fiscal',
          description: 'General aplicable.',
          isRequired: true,
          isActive: true,
        },
        {
          name: 'Estados de cuenta',
          description: 'General aplicable.',
          isRequired: true,
          isActive: true,
        },
        {
          name: 'Identificacion oficial',
          description: 'General aplicable.',
          isRequired: true,
          isActive: true,
        },
        {
          name: 'Solicitud firmada',
          description: 'General aplicable.',
          isRequired: true,
          isActive: true,
        },
        {
          name: 'Facturas por cobrar',
          description: 'Solo facturas.',
          isRequired: true,
          appliesTo: 'invoices',
          isActive: true,
        },
        {
          name: 'Acta constitutiva',
          description: 'Solo persona moral.',
          isRequired: true,
          appliesToBusinessType: 'persona_moral',
          isActive: true,
        },
      ],
    });

    const companyA = await prisma.company.create({
      data: {
        legalName: 'Comercial Alpha Persona Fisica',
        rfc: 'MORA900101ABC',
        businessType: 'pfae',
        sector: 'Comercio',
        yearsOperating: '3.00',
        monthlyRevenue: '120000.00',
        monthlyExpenses: '80000.00',
        applicantUserId: applicantA.id,
        createdByUserId: applicantA.id,
      },
    });

    const companyB = await prisma.company.create({
      data: {
        legalName: 'Comercial Beta Persona Fisica',
        rfc: 'GOME900101ABC',
        businessType: 'pfae',
        sector: 'Comercio',
        yearsOperating: '2.00',
        monthlyRevenue: '90000.00',
        monthlyExpenses: '45000.00',
        applicantUserId: applicantB.id,
        createdByUserId: applicantB.id,
      },
    });

    const applicationA = await prisma.financingApplication.create({
      data: {
        companyId: companyA.id,
        requestedAmount: '250000.00',
        desiredTermMonths: 18,
        fundingPurpose: 'Capital para compra de inventario.',
        urgencyLevel: 'medium',
        needType: 'working_capital',
        createdByUserId: applicantA.id,
      },
    });

    const applicationB = await prisma.financingApplication.create({
      data: {
        companyId: companyB.id,
        requestedAmount: '100000.00',
        desiredTermMonths: 12,
        fundingPurpose: 'Capital para proveedores.',
        urgencyLevel: 'low',
        needType: 'working_capital',
        createdByUserId: applicantB.id,
      },
    });

    expect(operator.id).toBeDefined();
    applicationAId = applicationA.id;
    applicationBId = applicationB.id;
  }

  async function expectStoredFileExists(storedPath: string | null) {
    expect(storedPath).not.toBeNull();
    const absolutePath = resolve(
      process.cwd(),
      '..',
      '..',
      storedPath as string,
    );
    await expect(stat(absolutePath)).resolves.toBeDefined();
  }

  async function cleanupUploadDirectory(applicationId?: string) {
    if (!applicationId) {
      return;
    }

    const directory = resolve(
      process.cwd(),
      '..',
      '..',
      'uploads',
      'applications',
      applicationId,
    );
    await rm(directory, { recursive: true, force: true });
    await mkdir(join(directory, '..'), { recursive: true });
  }

  function validPdf(label: string) {
    return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Title (${label}) >>\nendobj\n%%EOF`);
  }
});
