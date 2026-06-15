import { Injectable } from '@nestjs/common';
import {
  ApplicationDecision,
  ApplicationDocument,
  ApplicationMatch,
  ApplicationStatus,
  Company,
  DecisionStatus,
  DocumentRequirement,
  FinancialProduct,
  FinancingApplication,
  Prisma,
  RiskAssessment,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CloseApplicationDto } from './dto/close-application.dto';
import { CreateApplicationDecisionDto } from './dto/create-application-decision.dto';
import { UpdateApplicationDecisionDto } from './dto/update-application-decision.dto';

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

type ApplicationWithCompany = FinancingApplication & {
  company: Company;
};

type DecisionWithRelations = ApplicationDecision & {
  selectedMatch?:
    | (ApplicationMatch & { financialProduct: FinancialProduct })
    | null;
  riskAssessment?: RiskAssessment | null;
  decidedBy?: {
    id: string;
    fullName: string;
    email: string;
  };
};

type DocumentWithRequirement = ApplicationDocument & {
  documentRequirement: DocumentRequirement;
};

const PUBLIC_DECISION_LEGEND =
  'Esta respuesta corresponde a una precalificacion o revision inicial. No representa una aprobacion final de credito ni una obligacion contractual.';

const PUBLISHABLE_APPLICATION_STATUSES: ApplicationStatus[] = [
  'matched',
  'decision_published',
];

@Injectable()
export class ApplicationDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInternalFile(applicationId: string) {
    const application = await this.findApplication(applicationId);
    const [documents, riskAssessments, statusHistory, decisions] =
      await Promise.all([
        this.prisma.applicationDocument.findMany({
          where: { applicationId },
          include: { documentRequirement: true },
          orderBy: { documentRequirement: { name: 'asc' } },
        }),
        this.prisma.riskAssessment.findMany({
          where: { applicationId },
          orderBy: { calculatedAt: 'desc' },
          include: {
            applicationMatches: {
              include: { financialProduct: true },
              orderBy: { compatibilityScore: 'desc' },
            },
          },
        }),
        this.prisma.applicationStatusHistory.findMany({
          where: { applicationId },
          orderBy: { changedAt: 'asc' },
          include: {
            changedBy: { select: { id: true, fullName: true, email: true } },
          },
        }),
        this.findDecisionRecords(applicationId),
      ]);

    return {
      application: this.toApplicationResponse(application),
      company: this.toCompanyResponse(application.company),
      documents: documents.map((document) => this.toDocumentResponse(document)),
      riskAssessments: riskAssessments.map((assessment) =>
        this.toRiskAssessmentResponse(assessment),
      ),
      statusHistory: statusHistory.map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        comment: item.comment,
        changedByUserId: item.changedByUserId,
        changedBy: item.changedBy,
        changedAt: item.changedAt,
        createdAt: item.createdAt,
      })),
      decisions: decisions.map((decision) =>
        this.toInternalDecisionResponse(decision),
      ),
    };
  }

  async create(
    applicationId: string,
    dto: CreateApplicationDecisionDto,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const application = await this.findApplication(applicationId);

    if (application.status === 'closed') {
      throw this.invalidTransition('No se puede crear decision en caso cerrado.', [
        { field: 'status', issue: 'closed' },
      ]);
    }

    await this.validateDecisionInput(applicationId, dto);

    const decision = await this.prisma.$transaction(async (tx) => {
      const created = await tx.applicationDecision.create({
        data: {
          applicationId,
          riskAssessmentId: dto.riskAssessmentId,
          selectedMatchId: dto.selectedMatchId ?? null,
          decisionStatus: dto.decisionStatus,
          approvedAmount:
            dto.approvedAmount == null
              ? null
              : new Prisma.Decimal(dto.approvedAmount),
          approvedTermMonths: dto.approvedTermMonths ?? null,
          estimatedMonthlyPayment:
            dto.estimatedMonthlyPayment == null
              ? null
              : new Prisma.Decimal(dto.estimatedMonthlyPayment),
          publicMessage: dto.publicMessage.trim(),
          internalNotes: dto.internalNotes?.trim() || null,
          decidedByUserId: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'create',
          entityName: 'application_decisions',
          entityId: created.id,
          newValues: this.auditDecisionValues(created),
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });

      return created;
    });

    return this.findOneInternal(decision.id);
  }

  async findByApplication(applicationId: string) {
    await this.ensureApplicationExists(applicationId);
    const decisions = await this.findDecisionRecords(applicationId);

    return decisions.map((decision) => this.toInternalDecisionResponse(decision));
  }

  async update(
    decisionId: string,
    dto: UpdateApplicationDecisionDto,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const current = await this.findDecisionRecord(decisionId);

    if (current.application.status === 'closed') {
      throw this.invalidTransition('No se puede editar decision de caso cerrado.', [
        { field: 'status', issue: 'closed' },
      ]);
    }

    const candidate = {
      riskAssessmentId: dto.riskAssessmentId ?? current.riskAssessmentId,
      selectedMatchId:
        dto.selectedMatchId === undefined
          ? current.selectedMatchId
          : dto.selectedMatchId,
      decisionStatus: dto.decisionStatus ?? current.decisionStatus,
      approvedAmount:
        dto.approvedAmount === undefined
          ? this.decimalToNumber(current.approvedAmount)
          : dto.approvedAmount,
      approvedTermMonths:
        dto.approvedTermMonths === undefined
          ? current.approvedTermMonths
          : dto.approvedTermMonths,
      estimatedMonthlyPayment:
        dto.estimatedMonthlyPayment === undefined
          ? this.decimalToNumber(current.estimatedMonthlyPayment)
          : dto.estimatedMonthlyPayment,
      publicMessage: dto.publicMessage ?? current.publicMessage,
      internalNotes:
        dto.internalNotes === undefined
          ? current.internalNotes
          : dto.internalNotes,
    };

    await this.validateDecisionInput(current.applicationId, candidate);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.applicationDecision.update({
        where: { id: decisionId },
        data: {
          riskAssessmentId: dto.riskAssessmentId,
          selectedMatchId:
            dto.selectedMatchId === undefined ? undefined : dto.selectedMatchId,
          decisionStatus: dto.decisionStatus,
          approvedAmount:
            dto.approvedAmount === undefined
              ? undefined
              : dto.approvedAmount === null
                ? null
                : new Prisma.Decimal(dto.approvedAmount),
          approvedTermMonths: dto.approvedTermMonths,
          estimatedMonthlyPayment:
            dto.estimatedMonthlyPayment === undefined
              ? undefined
              : dto.estimatedMonthlyPayment === null
                ? null
                : new Prisma.Decimal(dto.estimatedMonthlyPayment),
          publicMessage:
            dto.publicMessage === undefined
              ? undefined
              : dto.publicMessage.trim(),
          internalNotes:
            dto.internalNotes === undefined
              ? undefined
              : dto.internalNotes?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'update',
          entityName: 'application_decisions',
          entityId: decisionId,
          oldValues: this.auditDecisionValues(current),
          newValues: this.auditDecisionValues(updated),
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    });

    return this.findOneInternal(decisionId);
  }

  async publish(
    decisionId: string,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const decision = await this.findDecisionRecord(decisionId);
    this.validatePublishableDecision(decision);

    const publishedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.applicationDecision.updateMany({
        where: {
          applicationId: decision.applicationId,
          isPublishedToApplicant: true,
          id: { not: decisionId },
        },
        data: { isPublishedToApplicant: false },
      });

      const updated = await tx.applicationDecision.update({
        where: { id: decisionId },
        data: {
          isPublishedToApplicant: true,
          publishedAt,
        },
      });

      if (decision.application.status !== 'decision_published') {
        await tx.financingApplication.update({
          where: { id: decision.applicationId },
          data: { status: 'decision_published' },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: decision.applicationId,
            previousStatus: decision.application.status,
            newStatus: 'decision_published',
            comment: 'Decision publicada al applicant.',
            changedByUserId: user.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'publish_decision',
          entityName: 'application_decisions',
          entityId: decisionId,
          oldValues: {
            isPublishedToApplicant: decision.isPublishedToApplicant,
            publishedAt: decision.publishedAt,
          },
          newValues: {
            ...this.auditDecisionValues(updated),
            publishedAt,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    });

    return this.findOneInternal(decisionId);
  }

  async getPublicDecision(applicationId: string, user: AuthenticatedUser) {
    await this.findAccessibleApplication(applicationId, user);

    const decision = await this.prisma.applicationDecision.findFirst({
      where: {
        applicationId,
        isPublishedToApplicant: true,
      },
      include: {
        selectedMatch: { include: { financialProduct: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (!decision) {
      const application = await this.prisma.financingApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, status: true },
      });

      return {
        applicationId,
        status: 'not_published',
        applicationStatus: application?.status ?? null,
        message: 'Solicitud en revision.',
      };
    }

    return this.toPublicDecisionResponse(decision);
  }

  async close(
    applicationId: string,
    dto: CloseApplicationDto,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const application = await this.findApplication(applicationId);

    if (application.status === 'closed') {
      throw this.invalidTransition('La solicitud ya esta cerrada.', [
        { field: 'status', issue: 'closed' },
      ]);
    }

    const publishedDecision = await this.prisma.applicationDecision.findFirst({
      where: {
        applicationId,
        isPublishedToApplicant: true,
      },
      select: { id: true },
    });

    if (!publishedDecision || application.status !== 'decision_published') {
      throw this.invalidTransition(
        'No se puede cerrar una solicitud sin decision publicada.',
        [
          {
            field: 'decision',
            issue: 'published_decision_required_before_close',
          },
        ],
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.financingApplication.update({
        where: { id: applicationId },
        data: { status: 'closed' },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId,
          previousStatus: application.status,
          newStatus: 'closed',
          comment: dto.comment?.trim() || 'Solicitud cerrada.',
          changedByUserId: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'status_change',
          entityName: 'financing_applications',
          entityId: applicationId,
          oldValues: { status: application.status },
          newValues: {
            status: 'closed',
            publishedDecisionId: publishedDecision.id,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    });

    return {
      id: applicationId,
      previousStatus: application.status,
      status: 'closed',
    };
  }

  private async findApplication(
    applicationId: string,
  ): Promise<ApplicationWithCompany> {
    const application = await this.prisma.financingApplication.findUnique({
      where: { id: applicationId },
      include: { company: true },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }

    return application;
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
      select: { id: true },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }

    return application;
  }

  private async ensureApplicationExists(applicationId: string) {
    const application = await this.prisma.financingApplication.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }
  }

  private async findDecisionRecords(applicationId: string) {
    return this.prisma.applicationDecision.findMany({
      where: { applicationId },
      include: {
        riskAssessment: true,
        selectedMatch: { include: { financialProduct: true } },
        decidedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { decidedAt: 'desc' },
    });
  }

  private async findDecisionRecord(decisionId: string) {
    const decision = await this.prisma.applicationDecision.findUnique({
      where: { id: decisionId },
      include: {
        application: true,
        riskAssessment: true,
        selectedMatch: { include: { financialProduct: true } },
        decidedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!decision) {
      throw new ApiException(404, 'NOT_FOUND', 'Decision no encontrada.');
    }

    return decision;
  }

  private async findOneInternal(decisionId: string) {
    const decision = await this.findDecisionRecord(decisionId);

    return this.toInternalDecisionResponse(decision);
  }

  private async validateDecisionInput(
    applicationId: string,
    dto: {
      riskAssessmentId: string;
      selectedMatchId?: string | null;
      decisionStatus: DecisionStatus;
      approvedAmount?: number | null;
      approvedTermMonths?: number | null;
      publicMessage?: string;
    },
  ) {
    const details: Array<{ field: string; issue: string }> = [];

    if (!dto.publicMessage?.trim()) {
      details.push({ field: 'publicMessage', issue: 'required' });
    }

    if (dto.decisionStatus === 'prequalified') {
      if (!dto.approvedAmount || dto.approvedAmount <= 0) {
        details.push({
          field: 'approvedAmount',
          issue: 'required_when_prequalified',
        });
      }

      if (!dto.approvedTermMonths || dto.approvedTermMonths <= 0) {
        details.push({
          field: 'approvedTermMonths',
          issue: 'required_when_prequalified',
        });
      }
    }

    const riskAssessment = await this.prisma.riskAssessment.findUnique({
      where: { id: dto.riskAssessmentId },
      select: { id: true, applicationId: true },
    });

    if (!riskAssessment) {
      details.push({ field: 'riskAssessmentId', issue: 'not_found' });
    } else if (riskAssessment.applicationId !== applicationId) {
      details.push({
        field: 'riskAssessmentId',
        issue: 'must_belong_to_application',
      });
    }

    if (dto.selectedMatchId) {
      const match = await this.prisma.applicationMatch.findUnique({
        where: { id: dto.selectedMatchId },
        select: { id: true, riskAssessmentId: true },
      });

      if (!match) {
        details.push({ field: 'selectedMatchId', issue: 'not_found' });
      } else if (match.riskAssessmentId !== dto.riskAssessmentId) {
        details.push({
          field: 'selectedMatchId',
          issue: 'must_belong_to_risk_assessment',
        });
      }
    }

    if (details.length > 0) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'La decision contiene datos invalidos.',
        details,
      );
    }
  }

  private validatePublishableDecision(
    decision: ApplicationDecision & { application: FinancingApplication },
  ) {
    const details: Array<{ field: string; issue: string }> = [];

    if (!PUBLISHABLE_APPLICATION_STATUSES.includes(decision.application.status)) {
      details.push({
        field: 'status',
        issue: `cannot_publish_from_${decision.application.status}`,
      });
    }

    if (!decision.publicMessage.trim()) {
      details.push({ field: 'publicMessage', issue: 'required_before_publish' });
    }

    if (decision.decisionStatus === 'prequalified') {
      if (!decision.approvedAmount || decision.approvedAmount.lte(0)) {
        details.push({
          field: 'approvedAmount',
          issue: 'required_when_prequalified',
        });
      }

      if (!decision.approvedTermMonths || decision.approvedTermMonths <= 0) {
        details.push({
          field: 'approvedTermMonths',
          issue: 'required_when_prequalified',
        });
      }
    }

    if (details.length > 0) {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'No se puede publicar la decision en el estado actual.',
        details,
      );
    }
  }

  private invalidTransition(
    message: string,
    details: Array<{ field: string; issue: string }>,
  ) {
    return new ApiException(400, 'INVALID_STATE_TRANSITION', message, details);
  }

  private auditDecisionValues(decision: ApplicationDecision) {
    return {
      applicationId: decision.applicationId,
      riskAssessmentId: decision.riskAssessmentId,
      selectedMatchId: decision.selectedMatchId,
      decisionStatus: decision.decisionStatus,
      approvedAmount: decision.approvedAmount?.toString() ?? null,
      approvedTermMonths: decision.approvedTermMonths,
      estimatedMonthlyPayment:
        decision.estimatedMonthlyPayment?.toString() ?? null,
      publicMessage: decision.publicMessage,
      isPublishedToApplicant: decision.isPublishedToApplicant,
    };
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return value === null ? undefined : Number(value.toString());
  }

  private toCompanyResponse(company: Company) {
    return {
      id: company.id,
      legalName: company.legalName,
      tradeName: company.tradeName,
      rfc: company.rfc,
      businessType: company.businessType,
      sector: company.sector,
      yearsOperating: company.yearsOperating.toString(),
      monthlyRevenue: company.monthlyRevenue.toString(),
      monthlyExpenses: company.monthlyExpenses.toString(),
      employeeCount: company.employeeCount,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      applicantUserId: company.applicantUserId,
      createdByUserId: company.createdByUserId,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }

  private toApplicationResponse(application: FinancingApplication) {
    return {
      id: application.id,
      companyId: application.companyId,
      requestedAmount: application.requestedAmount.toString(),
      desiredTermMonths: application.desiredTermMonths,
      fundingPurpose: application.fundingPurpose,
      urgencyLevel: application.urgencyLevel,
      needType: application.needType,
      validatedNeedType: application.validatedNeedType,
      needTypeValidatedByUserId: application.needTypeValidatedByUserId,
      needTypeValidatedAt: application.needTypeValidatedAt,
      needTypeValidationNotes: application.needTypeValidationNotes,
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
      createdByUserId: application.createdByUserId,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private toDocumentResponse(document: DocumentWithRequirement) {
    return {
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
      storedFilename: document.storedFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes?.toString() ?? null,
      fileHashSha256: document.fileHashSha256,
      notes: document.notes,
      uploadedByUserId: document.uploadedByUserId,
      uploadedAt: document.uploadedAt,
      reviewedByUserId: document.reviewedByUserId,
      reviewedAt: document.reviewedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private toRiskAssessmentResponse(
    assessment: RiskAssessment & {
      applicationMatches?: Array<ApplicationMatch & { financialProduct: FinancialProduct }>;
    },
  ) {
    return {
      id: assessment.id,
      applicationId: assessment.applicationId,
      estimatedCashflow: assessment.estimatedCashflow.toString(),
      operatingMargin: assessment.operatingMargin.toString(),
      requestedAmountToRevenueRatio:
        assessment.requestedAmountToRevenueRatio.toString(),
      estimatedMonthlyPayment: assessment.estimatedMonthlyPayment.toString(),
      totalMonthlyDebtPayment: assessment.totalMonthlyDebtPayment.toString(),
      debtServiceCoverageRatio: assessment.debtServiceCoverageRatio.toString(),
      paymentCapacity: assessment.paymentCapacity.toString(),
      documentCompletionPercentage:
        assessment.documentCompletionPercentage.toString(),
      riskScore: assessment.riskScore.toString(),
      riskLevel: assessment.riskLevel,
      riskReasons: assessment.riskReasons,
      inputSnapshot: assessment.inputSnapshot,
      ruleSetVersion: assessment.ruleSetVersion,
      calculatedByUserId: assessment.calculatedByUserId,
      calculatedAt: assessment.calculatedAt,
      createdAt: assessment.createdAt,
      matches:
        assessment.applicationMatches?.map((match) =>
          this.toMatchResponse(match),
        ) ?? [],
    };
  }

  private toMatchResponse(match: ApplicationMatch & { financialProduct: FinancialProduct }) {
    return {
      id: match.id,
      riskAssessmentId: match.riskAssessmentId,
      financialProductId: match.financialProductId,
      financialProduct: {
        id: match.financialProduct.id,
        name: match.financialProduct.name,
        idealFor: match.financialProduct.idealFor,
        isActive: match.financialProduct.isActive,
      },
      compatibilityScore: match.compatibilityScore.toString(),
      reason: this.parseReason(match.reason),
      estimatedAnnualRateUsed:
        match.estimatedAnnualRateUsed?.toString() ?? null,
      estimatedMonthlyPayment:
        match.estimatedMonthlyPayment?.toString() ?? null,
      debtServiceCoverageRatio:
        match.debtServiceCoverageRatio?.toString() ?? null,
      calculatedAt: match.calculatedAt,
      createdAt: match.createdAt,
    };
  }

  private toInternalDecisionResponse(decision: DecisionWithRelations) {
    return {
      id: decision.id,
      applicationId: decision.applicationId,
      riskAssessmentId: decision.riskAssessmentId,
      selectedMatchId: decision.selectedMatchId,
      selectedMatch: decision.selectedMatch
        ? this.toMatchResponse(decision.selectedMatch)
        : null,
      decisionStatus: decision.decisionStatus,
      approvedAmount: decision.approvedAmount?.toString() ?? null,
      approvedTermMonths: decision.approvedTermMonths,
      estimatedMonthlyPayment:
        decision.estimatedMonthlyPayment?.toString() ?? null,
      publicMessage: decision.publicMessage,
      internalNotes: decision.internalNotes,
      isPublishedToApplicant: decision.isPublishedToApplicant,
      decidedByUserId: decision.decidedByUserId,
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
      publishedAt: decision.publishedAt,
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
    };
  }

  private toPublicDecisionResponse(
    decision: ApplicationDecision & {
      selectedMatch?: (ApplicationMatch & { financialProduct: FinancialProduct }) | null;
    },
  ) {
    return {
      id: decision.id,
      applicationId: decision.applicationId,
      decisionStatus: decision.decisionStatus,
      productName: decision.selectedMatch?.financialProduct.name ?? null,
      approvedAmount: decision.approvedAmount?.toString() ?? null,
      approvedTermMonths: decision.approvedTermMonths,
      estimatedMonthlyPayment:
        decision.estimatedMonthlyPayment?.toString() ??
        decision.selectedMatch?.estimatedMonthlyPayment?.toString() ??
        null,
      annualInterestRate:
        decision.selectedMatch?.estimatedAnnualRateUsed?.toString() ?? null,
      publicMessage: decision.publicMessage,
      publishedAt: decision.publishedAt,
      legend: PUBLIC_DECISION_LEGEND,
    };
  }

  private parseReason(reason: string) {
    try {
      return JSON.parse(reason) as Prisma.JsonValue;
    } catch {
      return reason;
    }
  }
}
