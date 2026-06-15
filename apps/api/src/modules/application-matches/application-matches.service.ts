import { Injectable } from '@nestjs/common';
import {
  ApplicationMatch,
  Company,
  FinancialProduct,
  FinancingApplication,
  NeedType,
  Prisma,
  ProductRule,
  RiskAssessment,
  RuleField,
  RuleOperator,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import {
  calculateDebtServiceCoverageRatio,
  calculateMonthlyPayment,
  clampScore,
  roundDecimal,
} from '../../common/utils/financial-calculations';
import { PrismaService } from '../../common/prisma/prisma.service';

type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

type RiskAssessmentForMatching = RiskAssessment & {
  application: FinancingApplication & {
    company: Company;
  };
};

type ProductForMatching = FinancialProduct & {
  productRules: ProductRule[];
};

type MatchCandidate = {
  product: ProductForMatching;
  compatibilityScore: Prisma.Decimal;
  reason: Prisma.InputJsonValue;
  estimatedAnnualRateUsed: Prisma.Decimal;
  estimatedMonthlyPayment: Prisma.Decimal;
  debtServiceCoverageRatio: Prisma.Decimal;
};

type ExcludedProduct = {
  financialProductId: string;
  productName: string;
  reason: string;
};

const PREFERRED_PRODUCTS_BY_NEED: Record<NeedType, string[]> = {
  working_capital: ['capital de trabajo', 'credito simple', 'linea revolvente'],
  equipment: ['arrendamiento', 'credito simple'],
  invoices: ['factoraje', 'capital de trabajo'],
  expansion: ['credito simple', 'capital de trabajo', 'linea revolvente'],
  other: ['credito simple'],
};

@Injectable()
export class ApplicationMatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByRiskAssessment(riskAssessmentId: string) {
    await this.ensureRiskAssessmentExists(riskAssessmentId);

    const matches = await this.prisma.applicationMatch.findMany({
      where: { riskAssessmentId },
      include: { financialProduct: true },
      orderBy: { compatibilityScore: 'desc' },
    });

    return matches.map((match) => this.toResponse(match));
  }

  async generate(
    riskAssessmentId: string,
    user: AuthenticatedUser,
    context?: AuditContext,
  ) {
    const assessment = await this.findRiskAssessment(riskAssessmentId);

    if (assessment.application.status === 'closed') {
      throw new ApiException(
        400,
        'MATCH_PRECONDITION_FAILED',
        'No se puede generar matching para una solicitud cerrada.',
        [{ field: 'status', issue: 'closed' }],
      );
    }

    const products = await this.prisma.financialProduct.findMany({
      where: { isActive: true },
      include: {
        productRules: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const excludedProducts: ExcludedProduct[] = [];
    const candidates: MatchCandidate[] = [];
    const effectiveNeedType =
      assessment.application.validatedNeedType ?? assessment.application.needType;

    for (const product of products) {
      const result = this.evaluateProduct({
        assessment,
        product,
        effectiveNeedType,
      });

      if ('excluded' in result) {
        excludedProducts.push(result.excluded);
        continue;
      }

      candidates.push(result.candidate);
    }

    candidates.sort((left, right) =>
      Number(right.compatibilityScore.minus(left.compatibilityScore).toString()),
    );

    const matches = await this.prisma.$transaction(async (tx) => {
      await tx.applicationMatch.deleteMany({
        where: { riskAssessmentId },
      });

      const created = await Promise.all(
        candidates.map((candidate) =>
          tx.applicationMatch.create({
            data: {
              riskAssessmentId,
              financialProductId: candidate.product.id,
              compatibilityScore: candidate.compatibilityScore,
              reason: JSON.stringify(candidate.reason),
              estimatedAnnualRateUsed: candidate.estimatedAnnualRateUsed,
              estimatedMonthlyPayment: candidate.estimatedMonthlyPayment,
              debtServiceCoverageRatio: candidate.debtServiceCoverageRatio,
            },
            include: { financialProduct: true },
          }),
        ),
      );

      if (
        created.length > 0 &&
        assessment.application.status === 'analyzed'
      ) {
        await tx.financingApplication.update({
          where: { id: assessment.applicationId },
          data: { status: 'matched' },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: assessment.applicationId,
            previousStatus: 'analyzed',
            newStatus: 'matched',
            comment: 'Matching financiero generado.',
            changedByUserId: user.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'generate_matches',
          entityName: 'risk_assessments',
          entityId: riskAssessmentId,
          newValues: {
            applicationId: assessment.applicationId,
            generatedMatches: created.length,
            excludedProducts,
            effectiveNeedType,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });

      return created;
    });

    return {
      riskAssessmentId,
      applicationId: assessment.applicationId,
      effectiveNeedType,
      matches: matches.map((match) => this.toResponse(match)),
      excludedProducts,
      message:
        products.length === 0
          ? 'No existen productos activos para evaluar.'
          : candidates.length === 0
            ? 'No existen productos elegibles para esta solicitud.'
            : null,
    };
  }

  private async ensureRiskAssessmentExists(riskAssessmentId: string) {
    const assessment = await this.prisma.riskAssessment.findUnique({
      where: { id: riskAssessmentId },
      select: { id: true },
    });

    if (!assessment) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Analisis de riesgo no encontrado.',
      );
    }
  }

  private async findRiskAssessment(
    riskAssessmentId: string,
  ): Promise<RiskAssessmentForMatching> {
    const assessment = await this.prisma.riskAssessment.findUnique({
      where: { id: riskAssessmentId },
      include: {
        application: {
          include: { company: true },
        },
      },
    });

    if (!assessment) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Analisis de riesgo no encontrado.',
      );
    }

    return assessment;
  }

  private evaluateProduct(params: {
    assessment: RiskAssessmentForMatching;
    product: ProductForMatching;
    effectiveNeedType: NeedType;
  }):
    | { candidate: MatchCandidate }
    | { excluded: ExcludedProduct } {
    const { assessment, product, effectiveNeedType } = params;
    const application = assessment.application;
    const company = application.company;

    if (!product.estimatedAnnualRate) {
      return {
        excluded: this.exclusion(
          product,
          'Producto activo sin estimated_annual_rate.',
        ),
      };
    }

    if (application.requestedAmount.lt(product.minAmount)) {
      return {
        excluded: this.exclusion(product, 'Monto solicitado menor al minimo.'),
      };
    }

    if (application.requestedAmount.gt(product.maxAmount)) {
      return {
        excluded: this.exclusion(product, 'Monto solicitado mayor al maximo.'),
      };
    }

    if (company.yearsOperating.lt(product.minYearsOperating)) {
      return {
        excluded: this.exclusion(
          product,
          'Antiguedad operativa menor a la requerida.',
        ),
      };
    }

    if (product.requiresInvoices && application.hasInvoices !== true) {
      return {
        excluded: this.exclusion(
          product,
          'Producto exige facturas y has_invoices no es true.',
        ),
      };
    }

    if (product.requiresCollateral && application.hasCollateral !== true) {
      return {
        excluded: this.exclusion(
          product,
          'Producto exige garantia y has_collateral no es true.',
        ),
      };
    }

    if (this.requiresEquipmentNeed(product) && effectiveNeedType !== 'equipment') {
      return {
        excluded: this.exclusion(
          product,
          'Producto exige necesidad validada de equipo o activo.',
        ),
      };
    }

    const estimatedMonthlyPayment = calculateMonthlyPayment({
      principal: application.requestedAmount,
      annualRatePercent: product.estimatedAnnualRate,
      termMonths: application.desiredTermMonths,
    });
    const existingMonthlyDebtPayment =
      application.hasExistingDebt === true && application.monthlyDebtPayment
        ? application.monthlyDebtPayment
        : new Prisma.Decimal(0);
    const productDscr = calculateDebtServiceCoverageRatio({
      estimatedCashflow: assessment.estimatedCashflow,
      totalMonthlyDebtPayment: roundDecimal(
        existingMonthlyDebtPayment.plus(estimatedMonthlyPayment),
        2,
      ),
    });
    const context = this.buildRuleContext({
      assessment,
      productDscr,
      effectiveNeedType,
    });
    let score = new Prisma.Decimal(50);
    const reasons: Array<{
      code: string;
      description: string;
      impact: number;
    }> = [
      {
        code: 'base_score',
        description: 'Score base para producto elegible.',
        impact: 50,
      },
    ];
    const matchedRuleFields = new Set<RuleField>();

    for (const rule of product.productRules) {
      const matches = this.ruleMatches(rule, context);

      if (!matches) {
        continue;
      }

      matchedRuleFields.add(rule.ruleField);
      score = score.plus(rule.scoreWeight);
      reasons.push({
        code: `rule_${rule.ruleField}_${rule.operator}`,
        description: `Regla ${rule.ruleField} ${rule.operator} ${rule.conditionValue} aplicada.`,
        impact: rule.scoreWeight,
      });
    }

    if (assessment.riskLevel === 'high' && !matchedRuleFields.has('risk_level')) {
      score = score.minus(25);
      reasons.push({
        code: 'high_risk_default_penalty',
        description: 'Penalizacion por riesgo alto.',
        impact: -25,
      });
    }

    if (productDscr.lte(1) && !matchedRuleFields.has('debt_service_coverage_ratio')) {
      score = score.minus(35);
      reasons.push({
        code: 'critical_product_dscr_default_penalty',
        description: 'Penalizacion por DSCR de producto menor o igual a 1.',
        impact: -35,
      });
    }

    if (!this.isPreferredProduct(product, effectiveNeedType)) {
      score = score.minus(15);
      reasons.push({
        code: 'not_best_need_fit',
        description:
          'Producto viable, pero no es el mejor ajuste para la necesidad validada.',
        impact: -15,
      });
    }

    return {
      candidate: {
        product,
        compatibilityScore: clampScore(score),
        estimatedAnnualRateUsed: product.estimatedAnnualRate,
        estimatedMonthlyPayment,
        debtServiceCoverageRatio: productDscr,
        reason: {
          effectiveNeedType,
          suggestedAmount: application.requestedAmount.toString(),
          suggestedTermMonths: application.desiredTermMonths,
          estimatedAnnualRateUsed: product.estimatedAnnualRate.toString(),
          estimatedMonthlyPayment: estimatedMonthlyPayment.toString(),
          debtServiceCoverageRatio: productDscr.toString(),
          reasons,
        },
      },
    };
  }

  private buildRuleContext(params: {
    assessment: RiskAssessmentForMatching;
    productDscr: Prisma.Decimal;
    effectiveNeedType: NeedType;
  }) {
    const { assessment, productDscr, effectiveNeedType } = params;
    const application = assessment.application;
    const company = application.company;

    return {
      requested_amount: application.requestedAmount,
      desired_term_months: new Prisma.Decimal(application.desiredTermMonths),
      urgency_level: application.urgencyLevel,
      need_type: effectiveNeedType,
      years_operating: company.yearsOperating,
      monthly_revenue: company.monthlyRevenue,
      monthly_expenses: company.monthlyExpenses,
      employee_count: new Prisma.Decimal(company.employeeCount ?? 0),
      document_completion_percentage:
        assessment.documentCompletionPercentage,
      risk_level: assessment.riskLevel,
      credit_history_status: application.creditHistoryStatus ?? 'unknown',
      has_invoices: application.hasInvoices ?? false,
      has_existing_debt: application.hasExistingDebt ?? false,
      has_collateral: application.hasCollateral ?? false,
      has_guarantor: application.hasGuarantor ?? false,
      debt_service_coverage_ratio: productDscr,
    } satisfies Record<RuleField, Prisma.Decimal | string | boolean>;
  }

  private ruleMatches(
    rule: ProductRule,
    context: Record<RuleField, Prisma.Decimal | string | boolean>,
  ) {
    const value = context[rule.ruleField];

    if (value instanceof Prisma.Decimal) {
      return this.numericRuleMatches(
        value,
        rule.operator,
        rule.conditionValue,
        rule.conditionValueTo,
      );
    }

    if (typeof value === 'boolean') {
      return this.booleanRuleMatches(value, rule.operator, rule.conditionValue);
    }

    return this.stringRuleMatches(value, rule.operator, rule.conditionValue);
  }

  private numericRuleMatches(
    value: Prisma.Decimal,
    operator: RuleOperator,
    conditionValue: string,
    conditionValueTo: string | null,
  ) {
    const from = new Prisma.Decimal(conditionValue);
    const to = conditionValueTo ? new Prisma.Decimal(conditionValueTo) : null;

    if (operator === 'equals') {
      return value.equals(from);
    }

    if (operator === 'not_equals') {
      return !value.equals(from);
    }

    if (operator === 'gte') {
      return value.gte(from);
    }

    if (operator === 'lte') {
      return value.lte(from);
    }

    if (operator === 'between' && to) {
      return value.gte(from) && value.lte(to);
    }

    return false;
  }

  private booleanRuleMatches(
    value: boolean,
    operator: RuleOperator,
    conditionValue: string,
  ) {
    const expected = conditionValue.toLowerCase() === 'true';

    if (operator === 'equals') {
      return value === expected;
    }

    if (operator === 'not_equals') {
      return value !== expected;
    }

    return false;
  }

  private stringRuleMatches(
    value: string,
    operator: RuleOperator,
    conditionValue: string,
  ) {
    if (operator === 'equals') {
      return value === conditionValue;
    }

    if (operator === 'not_equals') {
      return value !== conditionValue;
    }

    if (operator === 'contains') {
      return value.includes(conditionValue);
    }

    return false;
  }

  private isPreferredProduct(product: FinancialProduct, needType: NeedType) {
    if (product.idealFor === needType) {
      return true;
    }

    const normalizedName = this.normalizeProductName(product.name);

    return PREFERRED_PRODUCTS_BY_NEED[needType].some((preferred) =>
      normalizedName.includes(preferred),
    );
  }

  private requiresEquipmentNeed(product: FinancialProduct) {
    return (
      product.idealFor === 'equipment' ||
      this.normalizeProductName(product.name).includes('arrendamiento')
    );
  }

  private normalizeProductName(name: string) {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private exclusion(product: FinancialProduct, reason: string): ExcludedProduct {
    return {
      financialProductId: product.id,
      productName: product.name,
      reason,
    };
  }

  private toResponse(
    match: ApplicationMatch & { financialProduct?: FinancialProduct },
  ) {
    return {
      id: match.id,
      riskAssessmentId: match.riskAssessmentId,
      financialProductId: match.financialProductId,
      financialProduct: match.financialProduct
        ? {
            id: match.financialProduct.id,
            name: match.financialProduct.name,
            idealFor: match.financialProduct.idealFor,
            isActive: match.financialProduct.isActive,
          }
        : undefined,
      compatibilityScore: match.compatibilityScore.toString(),
      reason: match.reason,
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
}
