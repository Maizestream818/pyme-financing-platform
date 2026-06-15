import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  Company,
  FinancingApplication,
  Prisma,
  RiskAssessment,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import {
  calculateDebtServiceCoverageRatio,
  calculateMonthlyPayment,
  clampScore,
  riskLevelFromScore,
  roundDecimal,
} from '../../common/utils/financial-calculations';
import { PrismaService } from '../../common/prisma/prisma.service';

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

type ApplicationForRisk = FinancingApplication & {
  company: Company;
};

type DocumentCompletion = {
  requiredApplicableDocuments: number;
  approvedRequiredApplicableDocuments: number;
  notApplicableRequiredDocuments: number;
  percentage: Prisma.Decimal;
};

const RISK_ALLOWED_STATUSES: ApplicationStatus[] = [
  'ready_for_analysis',
  'analyzed',
  'matched',
];

@Injectable()
export class RiskAssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(
    applicationId: string,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const application = await this.findApplication(applicationId);

    this.validateRiskPreconditions(application);

    const documentCompletion = await this.calculateDocumentCompletion(applicationId);
    const analysis = this.buildRiskAnalysis(application, documentCompletion);

    const riskAssessment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.riskAssessment.create({
        data: {
          applicationId,
          estimatedCashflow: analysis.estimatedCashflow,
          operatingMargin: analysis.operatingMargin,
          requestedAmountToRevenueRatio: analysis.requestedAmountToRevenueRatio,
          estimatedMonthlyPayment: analysis.estimatedMonthlyPayment,
          totalMonthlyDebtPayment: analysis.totalMonthlyDebtPayment,
          debtServiceCoverageRatio: analysis.debtServiceCoverageRatio,
          paymentCapacity: analysis.paymentCapacity,
          documentCompletionPercentage: analysis.documentCompletionPercentage,
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          riskReasons: analysis.riskReasons,
          inputSnapshot: analysis.inputSnapshot,
          ruleSetVersion: 'fase-06-mvp',
          calculatedByUserId: user.id,
        },
      });

      if (application.status === 'ready_for_analysis') {
        await tx.financingApplication.update({
          where: { id: applicationId },
          data: { status: 'analyzed' },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId,
            previousStatus: application.status,
            newStatus: 'analyzed',
            comment: 'Analisis de riesgo calculado.',
            changedByUserId: user.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'calculate_risk',
          entityName: 'risk_assessments',
          entityId: created.id,
          newValues: {
            applicationId,
            riskScore: analysis.riskScore.toString(),
            riskLevel: analysis.riskLevel,
            documentCompletionPercentage:
              analysis.documentCompletionPercentage.toString(),
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });

      return created;
    });

    return this.toResponse(riskAssessment);
  }

  async findByApplication(applicationId: string) {
    await this.ensureApplicationExists(applicationId);

    const assessments = await this.prisma.riskAssessment.findMany({
      where: { applicationId },
      orderBy: { calculatedAt: 'desc' },
    });

    return assessments.map((assessment) => this.toResponse(assessment));
  }

  async findOne(id: string) {
    const assessment = await this.prisma.riskAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Analisis de riesgo no encontrado.',
      );
    }

    return this.toResponse(assessment);
  }

  private async findApplication(applicationId: string): Promise<ApplicationForRisk> {
    const application = await this.prisma.financingApplication.findUnique({
      where: { id: applicationId },
      include: { company: true },
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

  private validateRiskPreconditions(application: ApplicationForRisk) {
    const details: Array<{ field: string; issue: string }> = [];

    if (!RISK_ALLOWED_STATUSES.includes(application.status)) {
      details.push({
        field: 'status',
        issue: `cannot_calculate_from_${application.status}`,
      });
    }

    if (application.status === 'closed') {
      details.push({ field: 'status', issue: 'closed' });
    }

    if (application.company.monthlyRevenue.lte(0)) {
      details.push({
        field: 'monthlyRevenue',
        issue: 'required_positive_before_risk_analysis',
      });
    }

    if (application.company.monthlyExpenses.lt(0)) {
      details.push({
        field: 'monthlyExpenses',
        issue: 'must_be_gte_0_before_risk_analysis',
      });
    }

    if (application.requestedAmount.lte(0)) {
      details.push({
        field: 'requestedAmount',
        issue: 'required_positive_before_risk_analysis',
      });
    }

    if (application.desiredTermMonths <= 0) {
      details.push({
        field: 'desiredTermMonths',
        issue: 'required_positive_before_risk_analysis',
      });
    }

    if (application.hasExistingDebt === null) {
      details.push({
        field: 'hasExistingDebt',
        issue: 'required_before_risk_analysis',
      });
    }

    if (application.hasExistingDebt === true) {
      if (!application.existingDebtAmount || application.existingDebtAmount.lte(0)) {
        details.push({
          field: 'existingDebtAmount',
          issue: 'required_when_debt_exists',
        });
      }

      if (!application.monthlyDebtPayment || application.monthlyDebtPayment.lte(0)) {
        details.push({
          field: 'monthlyDebtPayment',
          issue: 'required_when_debt_exists',
        });
      }
    }

    if (details.length > 0) {
      throw new ApiException(
        400,
        'RISK_PRECONDITION_FAILED',
        'No se puede calcular riesgo porque faltan precondiciones.',
        details,
      );
    }
  }

  private async calculateDocumentCompletion(
    applicationId: string,
  ): Promise<DocumentCompletion> {
    const documents = await this.prisma.applicationDocument.findMany({
      where: {
        applicationId,
        documentRequirement: { isRequired: true },
      },
      include: {
        documentRequirement: {
          select: { id: true, name: true, isRequired: true },
        },
      },
    });

    const requiredApplicableDocuments = documents.filter(
      (document) => document.status !== 'not_applicable',
    );
    const approvedRequiredApplicableDocuments =
      requiredApplicableDocuments.filter(
        (document) => document.status === 'approved',
      );
    const notApplicableRequiredDocuments = documents.filter(
      (document) => document.status === 'not_applicable',
    );

    if (requiredApplicableDocuments.length === 0) {
      throw new ApiException(
        400,
        'RISK_PRECONDITION_FAILED',
        'No se puede calcular riesgo sin documentos obligatorios aplicables.',
        [
          {
            field: 'documents',
            issue: 'required_applicable_documents_missing',
          },
        ],
      );
    }

    const percentage = roundDecimal(
      new Prisma.Decimal(approvedRequiredApplicableDocuments.length)
        .div(requiredApplicableDocuments.length)
        .mul(100),
      2,
    );

    return {
      requiredApplicableDocuments: requiredApplicableDocuments.length,
      approvedRequiredApplicableDocuments:
        approvedRequiredApplicableDocuments.length,
      notApplicableRequiredDocuments: notApplicableRequiredDocuments.length,
      percentage,
    };
  }

  private buildRiskAnalysis(
    application: ApplicationForRisk,
    documentCompletion: DocumentCompletion,
  ) {
    const monthlyRevenue = application.company.monthlyRevenue;
    const monthlyExpenses = application.company.monthlyExpenses;
    const estimatedCashflow = roundDecimal(monthlyRevenue.minus(monthlyExpenses), 2);
    const operatingMargin = roundDecimal(estimatedCashflow.div(monthlyRevenue), 4);
    const requestedAmountToRevenueRatio = roundDecimal(
      application.requestedAmount.div(monthlyRevenue),
      4,
    );
    const estimatedMonthlyPayment = calculateMonthlyPayment({
      principal: application.requestedAmount,
      termMonths: application.desiredTermMonths,
      annualRatePercent: null,
    });
    const existingMonthlyDebtPayment =
      application.hasExistingDebt === true && application.monthlyDebtPayment
        ? application.monthlyDebtPayment
        : new Prisma.Decimal(0);
    const totalMonthlyDebtPayment = roundDecimal(
      existingMonthlyDebtPayment.plus(estimatedMonthlyPayment),
      2,
    );
    const debtServiceCoverageRatio = calculateDebtServiceCoverageRatio({
      estimatedCashflow,
      totalMonthlyDebtPayment,
    });
    const paymentCapacity = roundDecimal(
      estimatedCashflow.minus(existingMonthlyDebtPayment),
      2,
    );
    const scoreResult = this.calculateRiskScore({
      estimatedCashflow,
      operatingMargin,
      requestedAmountToRevenueRatio,
      debtServiceCoverageRatio,
      yearsOperating: application.company.yearsOperating,
      documentCompletionPercentage: documentCompletion.percentage,
      creditHistoryStatus: application.creditHistoryStatus,
      hasCollateral: application.hasCollateral,
    });
    const inputSnapshot = this.buildInputSnapshot(application, {
      documentCompletion,
      estimatedMonthlyPayment,
      existingMonthlyDebtPayment,
      formulas: {
        monthlyPayment: 'requested_amount / desired_term_months',
        monthlyRateUsed: null,
      },
    });

    return {
      estimatedCashflow,
      operatingMargin,
      requestedAmountToRevenueRatio,
      estimatedMonthlyPayment,
      totalMonthlyDebtPayment,
      debtServiceCoverageRatio,
      paymentCapacity,
      documentCompletionPercentage: documentCompletion.percentage,
      riskScore: scoreResult.score,
      riskLevel: riskLevelFromScore(scoreResult.score),
      riskReasons: scoreResult.reasons,
      inputSnapshot,
    };
  }

  private calculateRiskScore(params: {
    estimatedCashflow: Prisma.Decimal;
    operatingMargin: Prisma.Decimal;
    requestedAmountToRevenueRatio: Prisma.Decimal;
    debtServiceCoverageRatio: Prisma.Decimal;
    yearsOperating: Prisma.Decimal;
    documentCompletionPercentage: Prisma.Decimal;
    creditHistoryStatus: string | null;
    hasCollateral: boolean | null;
  }) {
    let score = new Prisma.Decimal(100);
    const reasons: Array<{
      code: string;
      description: string;
      impact: number;
    }> = [];

    const applyImpact = (code: string, description: string, impact: number) => {
      score = score.plus(impact);
      reasons.push({ code, description, impact });
    };

    if (params.estimatedCashflow.lte(0)) {
      applyImpact('negative_cashflow', 'Flujo estimado menor o igual a cero.', -35);
    }

    if (params.operatingMargin.lt(0.1)) {
      applyImpact('low_operating_margin', 'Margen operativo menor a 10%.', -15);
    }

    if (params.requestedAmountToRevenueRatio.gt(2)) {
      applyImpact(
        'high_requested_amount_to_revenue',
        'Monto solicitado mayor a dos veces el ingreso mensual.',
        -20,
      );
    }

    if (params.debtServiceCoverageRatio.lte(1)) {
      applyImpact('critical_dscr', 'DSCR menor o igual a 1.', -35);
    } else if (params.debtServiceCoverageRatio.lte(1.5)) {
      applyImpact('tight_dscr', 'DSCR mayor a 1 y menor o igual a 1.5.', -15);
    }

    if (params.yearsOperating.lt(1)) {
      applyImpact('low_years_operating', 'Antiguedad operativa menor a 1 ano.', -20);
    }

    if (params.documentCompletionPercentage.lt(70)) {
      applyImpact(
        'low_document_completion',
        'Avance documental menor a 70%.',
        -20,
      );
    }

    if (params.creditHistoryStatus === 'bad') {
      applyImpact('bad_credit_history', 'Historial crediticio malo.', -30);
    }

    if (params.creditHistoryStatus === 'good') {
      applyImpact('good_credit_history', 'Historial crediticio bueno.', 10);
    }

    if (params.hasCollateral === true) {
      applyImpact('has_collateral', 'Cuenta con garantia.', 5);
    }

    return {
      score: clampScore(score),
      reasons,
    };
  }

  private buildInputSnapshot(
    application: ApplicationForRisk,
    params: {
      documentCompletion: DocumentCompletion;
      estimatedMonthlyPayment: Prisma.Decimal;
      existingMonthlyDebtPayment: Prisma.Decimal;
      formulas: { monthlyPayment: string; monthlyRateUsed: null };
    },
  ): Prisma.InputJsonValue {
    return {
      application: {
        id: application.id,
        requestedAmount: application.requestedAmount.toString(),
        desiredTermMonths: application.desiredTermMonths,
        urgencyLevel: application.urgencyLevel,
        needType: application.needType,
        validatedNeedType: application.validatedNeedType,
        hasInvoices: application.hasInvoices,
        hasExistingDebt: application.hasExistingDebt,
        existingDebtAmount: application.existingDebtAmount?.toString() ?? null,
        monthlyDebtPayment: application.monthlyDebtPayment?.toString() ?? null,
        creditHistoryStatus: application.creditHistoryStatus,
        hasCollateral: application.hasCollateral,
        hasGuarantor: application.hasGuarantor,
        status: application.status,
      },
      company: {
        id: application.company.id,
        businessType: application.company.businessType,
        sector: application.company.sector,
        yearsOperating: application.company.yearsOperating.toString(),
        monthlyRevenue: application.company.monthlyRevenue.toString(),
        monthlyExpenses: application.company.monthlyExpenses.toString(),
        employeeCount: application.company.employeeCount,
      },
      documents: {
        requiredApplicableDocuments:
          params.documentCompletion.requiredApplicableDocuments,
        approvedRequiredApplicableDocuments:
          params.documentCompletion.approvedRequiredApplicableDocuments,
        notApplicableRequiredDocuments:
          params.documentCompletion.notApplicableRequiredDocuments,
        documentCompletionPercentage:
          params.documentCompletion.percentage.toString(),
      },
      financialAssumptions: {
        estimatedMonthlyPayment: params.estimatedMonthlyPayment.toString(),
        existingMonthlyDebtPayment:
          params.existingMonthlyDebtPayment.toString(),
        ...params.formulas,
      },
      ruleSetVersion: 'fase-06-mvp',
    };
  }

  private toResponse(assessment: RiskAssessment) {
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
    };
  }
}
