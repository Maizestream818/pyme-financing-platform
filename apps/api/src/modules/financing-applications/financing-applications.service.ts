import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  FinancingApplication,
  NeedType,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StatusHistoryService } from '../status-history/status-history.service';
import { CreateFinancingApplicationDto } from './dto/create-financing-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateFinancialInfoDto } from './dto/update-financial-info.dto';
import { UpdateFinancingApplicationDto } from './dto/update-financing-application.dto';
import { ValidateNeedTypeDto } from './dto/validate-need-type.dto';

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

type ApplicationWithCompany = FinancingApplication & {
  company?: {
    id: string;
    legalName: string;
    rfc: string;
    applicantUserId: string | null;
  };
};

const APPLICANT_LOCKED_STATUSES: ApplicationStatus[] = [
  'ready_for_analysis',
  'analyzed',
  'matched',
  'decision_published',
  'closed',
];

const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['documents_pending', 'ready_for_analysis', 'closed'],
  documents_pending: ['draft', 'ready_for_analysis', 'closed'],
  ready_for_analysis: ['documents_pending', 'analyzed', 'closed'],
  analyzed: ['ready_for_analysis', 'matched', 'closed'],
  matched: ['decision_published'],
  decision_published: ['closed'],
  closed: [],
};

@Injectable()
export class FinancingApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusHistory: StatusHistoryService,
  ) {}

  async findAll(user: AuthenticatedUser) {
    const applications = await this.prisma.financingApplication.findMany({
      where:
        user.role === 'applicant'
          ? { company: { applicantUserId: user.id } }
          : undefined,
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            rfc: true,
            applicantUserId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((application) => this.toResponse(application, user));
  }

  async create(dto: CreateFinancingApplicationDto, user: AuthenticatedUser) {
    await this.ensureCompanyCanReceiveApplication(dto.companyId, user);

    const application = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financingApplication.create({
        data: {
          companyId: dto.companyId,
          requestedAmount: new Prisma.Decimal(dto.requestedAmount),
          desiredTermMonths: dto.desiredTermMonths,
          fundingPurpose: dto.fundingPurpose.trim(),
          urgencyLevel: dto.urgencyLevel,
          needType: dto.needType,
          status: 'draft',
          createdByUserId: user.id,
        },
        include: {
          company: {
            select: {
              id: true,
              legalName: true,
              rfc: true,
              applicantUserId: true,
            },
          },
        },
      });

      await this.statusHistory.record(
        {
          applicationId: created.id,
          previousStatus: null,
          newStatus: 'draft',
          comment: 'Solicitud creada.',
          changedByUserId: user.id,
        },
        tx,
      );

      return created;
    });

    return this.toResponse(application, user);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const application = await this.findAccessibleApplication(id, user);

    return this.toResponse(application, user);
  }

  async update(
    id: string,
    dto: UpdateFinancingApplicationDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.findAccessibleApplication(id, user);
    this.ensureApplicationCanBeEdited(current, user);

    const application = await this.prisma.financingApplication.update({
      where: { id },
      data: {
        requestedAmount:
          dto.requestedAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.requestedAmount),
        desiredTermMonths: dto.desiredTermMonths,
        fundingPurpose:
          dto.fundingPurpose === undefined ? undefined : dto.fundingPurpose.trim(),
        urgencyLevel: dto.urgencyLevel,
        needType: dto.needType,
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            rfc: true,
            applicantUserId: true,
          },
        },
      },
    });

    return this.toResponse(application, user);
  }

  async updateFinancialInfo(
    id: string,
    dto: UpdateFinancialInfoDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.findAccessibleApplication(id, user);
    this.ensureApplicationCanBeEdited(current, user);

    const data = this.buildFinancialInfoUpdate(current, dto);

    const application = await this.prisma.financingApplication.update({
      where: { id },
      data,
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            rfc: true,
            applicantUserId: true,
          },
        },
      },
    });

    return this.toResponse(application, user);
  }

  async updateStatus(
    id: string,
    dto: UpdateApplicationStatusDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.findAccessibleApplication(id, user);

    if (current.status === dto.status) {
      return this.toResponse(current, user);
    }

    this.ensureValidStatusTransition(current.status, dto.status);

    const application = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financingApplication.update({
        where: { id },
        data: { status: dto.status },
        include: {
          company: {
            select: {
              id: true,
              legalName: true,
              rfc: true,
              applicantUserId: true,
            },
          },
        },
      });

      await this.statusHistory.record(
        {
          applicationId: id,
          previousStatus: current.status,
          newStatus: dto.status,
          comment: dto.comment,
          changedByUserId: user.id,
        },
        tx,
      );

      return updated;
    });

    return this.toResponse(application, user);
  }

  async validateNeedType(
    id: string,
    dto: ValidateNeedTypeDto,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const current = await this.findAccessibleApplication(id, user);

    if (current.status === 'closed') {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'No se puede validar necesidad de una solicitud cerrada.',
        [{ field: 'status', issue: 'closed' }],
      );
    }

    const validatedAt = new Date();

    const application = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financingApplication.update({
        where: { id },
        data: {
          validatedNeedType: dto.validatedNeedType,
          needTypeValidatedByUserId: user.id,
          needTypeValidatedAt: validatedAt,
          needTypeValidationNotes: dto.notes?.trim() || null,
        },
        include: {
          company: {
            select: {
              id: true,
              legalName: true,
              rfc: true,
              applicantUserId: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'validate_need_type',
          entityName: 'financing_applications',
          entityId: id,
          oldValues: {
            validatedNeedType: current.validatedNeedType,
            notes: current.needTypeValidationNotes,
          },
          newValues: {
            validatedNeedType: dto.validatedNeedType,
            notes: dto.notes?.trim() || null,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });

      return updated;
    });

    return this.toResponse(application, user);
  }

  async findStatusHistory(id: string, user: AuthenticatedUser) {
    return this.statusHistory.findForApplication(id, user);
  }

  private async ensureCompanyCanReceiveApplication(
    companyId: string,
    user: AuthenticatedUser,
  ) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        ...(user.role === 'applicant' ? { applicantUserId: user.id } : {}),
      },
      select: { id: true },
    });

    if (!company) {
      throw new ApiException(
        user.role === 'applicant' ? 403 : 404,
        user.role === 'applicant' ? 'FORBIDDEN' : 'NOT_FOUND',
        'La empresa no esta disponible para crear solicitudes.',
      );
    }
  }

  private async findAccessibleApplication(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ApplicationWithCompany> {
    const application = await this.prisma.financingApplication.findFirst({
      where: {
        id,
        ...(user.role === 'applicant'
          ? { company: { applicantUserId: user.id } }
          : {}),
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            rfc: true,
            applicantUserId: true,
          },
        },
      },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }

    return application;
  }

  private ensureApplicationCanBeEdited(
    application: FinancingApplication,
    user: AuthenticatedUser,
  ) {
    if (application.status === 'closed') {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'No se puede editar una solicitud cerrada.',
        [{ field: 'status', issue: 'closed' }],
      );
    }

    if (
      user.role === 'applicant' &&
      APPLICANT_LOCKED_STATUSES.includes(application.status)
    ) {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'Applicant no puede editar datos criticos despues de ready_for_analysis.',
        [{ field: 'status', issue: `locked_by_${application.status}` }],
      );
    }
  }

  private ensureValidStatusTransition(
    currentStatus: ApplicationStatus,
    nextStatus: ApplicationStatus,
  ) {
    const allowed = STATUS_TRANSITIONS[currentStatus];

    if (!allowed.includes(nextStatus)) {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        `Transicion invalida de ${currentStatus} a ${nextStatus}.`,
        [
          {
            field: 'status',
            issue: `${currentStatus}_to_${nextStatus}_not_allowed`,
          },
        ],
      );
    }
  }

  private buildFinancialInfoUpdate(
    current: FinancingApplication,
    dto: UpdateFinancialInfoDto,
  ): Prisma.FinancingApplicationUncheckedUpdateInput {
    const hasExistingDebt = dto.hasExistingDebt ?? current.hasExistingDebt;
    const existingDebtAmount =
      dto.existingDebtAmount !== undefined
        ? dto.existingDebtAmount
        : this.decimalToNumber(current.existingDebtAmount);
    const monthlyDebtPayment =
      dto.monthlyDebtPayment !== undefined
        ? dto.monthlyDebtPayment
        : this.decimalToNumber(current.monthlyDebtPayment);

    if (hasExistingDebt === true) {
      if (!existingDebtAmount || existingDebtAmount <= 0) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'La deuda existente requiere monto mayor a cero.',
          [{ field: 'existingDebtAmount', issue: 'required_when_debt_exists' }],
        );
      }

      if (!monthlyDebtPayment || monthlyDebtPayment <= 0) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'La deuda existente requiere pago mensual mayor a cero.',
          [{ field: 'monthlyDebtPayment', issue: 'required_when_debt_exists' }],
        );
      }
    }

    const hasCollateral = dto.hasCollateral ?? current.hasCollateral;
    const collateralType =
      dto.collateralType !== undefined
        ? dto.collateralType.trim()
        : current.collateralType;
    const collateralEstimatedValue =
      dto.collateralEstimatedValue !== undefined
        ? dto.collateralEstimatedValue
        : this.decimalToNumber(current.collateralEstimatedValue);

    if (hasCollateral === true) {
      if (!collateralType) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'La garantia requiere tipo de garantia.',
          [{ field: 'collateralType', issue: 'required_when_collateral_exists' }],
        );
      }

      if (!collateralEstimatedValue || collateralEstimatedValue <= 0) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'La garantia requiere valor estimado mayor a cero.',
          [
            {
              field: 'collateralEstimatedValue',
              issue: 'required_when_collateral_exists',
            },
          ],
        );
      }
    }

    return {
      hasInvoices: dto.hasInvoices,
      hasExistingDebt: dto.hasExistingDebt,
      existingDebtAmount:
        hasExistingDebt === false
          ? null
          : dto.existingDebtAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.existingDebtAmount),
      monthlyDebtPayment:
        hasExistingDebt === false
          ? null
          : dto.monthlyDebtPayment === undefined
            ? undefined
            : new Prisma.Decimal(dto.monthlyDebtPayment),
      creditCheckAuthorized: dto.creditCheckAuthorized,
      creditHistoryStatus: dto.creditHistoryStatus,
      hasCollateral: dto.hasCollateral,
      collateralType:
        hasCollateral === false
          ? null
          : dto.collateralType === undefined
            ? undefined
            : dto.collateralType.trim() || null,
      collateralEstimatedValue:
        hasCollateral === false
          ? null
          : dto.collateralEstimatedValue === undefined
            ? undefined
            : new Prisma.Decimal(dto.collateralEstimatedValue),
      hasGuarantor: dto.hasGuarantor,
    };
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return value === null ? undefined : Number(value.toString());
  }

  private toResponse(application: ApplicationWithCompany, user: AuthenticatedUser) {
    const company = application.company
      ? {
          id: application.company.id,
          legalName: application.company.legalName,
          rfc: application.company.rfc,
          ...(user.role === 'internal_operator'
            ? { applicantUserId: application.company.applicantUserId }
            : {}),
        }
      : undefined;

    const base = {
      id: application.id,
      companyId: application.companyId,
      company,
      requestedAmount: application.requestedAmount.toString(),
      desiredTermMonths: application.desiredTermMonths,
      fundingPurpose: application.fundingPurpose,
      urgencyLevel: application.urgencyLevel,
      needType: application.needType,
      hasInvoices: application.hasInvoices,
      hasExistingDebt: application.hasExistingDebt,
      existingDebtAmount: application.existingDebtAmount?.toString() ?? null,
      monthlyDebtPayment: application.monthlyDebtPayment?.toString() ?? null,
      creditCheckAuthorized: application.creditCheckAuthorized,
      creditHistoryStatus: application.creditHistoryStatus,
      hasCollateral: application.hasCollateral,
      collateralType: application.collateralType,
      collateralEstimatedValue:
        application.collateralEstimatedValue?.toString() ?? null,
      hasGuarantor: application.hasGuarantor,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };

    if (user.role === 'internal_operator') {
      return {
        ...base,
        validatedNeedType: application.validatedNeedType as NeedType | null,
        needTypeValidatedByUserId: application.needTypeValidatedByUserId,
        needTypeValidatedAt: application.needTypeValidatedAt,
        needTypeValidationNotes: application.needTypeValidationNotes,
        createdByUserId: application.createdByUserId,
      };
    }

    return base;
  }
}
