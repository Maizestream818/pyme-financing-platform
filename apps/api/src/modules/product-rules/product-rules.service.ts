import { Injectable } from '@nestjs/common';
import {
  CreditHistoryStatus,
  NeedType,
  ProductRule,
  RiskLevel,
  RuleField,
  RuleOperator,
  UrgencyLevel,
} from '@prisma/client';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductRuleDto } from './dto/create-product-rule.dto';
import { UpdateProductRuleDto } from './dto/update-product-rule.dto';

type RuleForValidation = {
  financialProductId: string;
  ruleField: RuleField;
  operator: RuleOperator;
  conditionValue: string;
  conditionValueTo?: string | null;
  scoreWeight: number;
};

const NUMERIC_FIELDS = new Set<RuleField>([
  'requested_amount',
  'desired_term_months',
  'years_operating',
  'monthly_revenue',
  'monthly_expenses',
  'employee_count',
  'document_completion_percentage',
  'debt_service_coverage_ratio',
]);

const BOOLEAN_FIELDS = new Set<RuleField>([
  'has_invoices',
  'has_existing_debt',
  'has_collateral',
  'has_guarantor',
]);

const ENUM_VALUES_BY_FIELD: Partial<Record<RuleField, string[]>> = {
  urgency_level: Object.values(UrgencyLevel),
  need_type: Object.values(NeedType),
  risk_level: Object.values(RiskLevel),
  credit_history_status: Object.values(CreditHistoryStatus),
};

@Injectable()
export class ProductRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductRuleDto) {
    const rule = this.normalizeRule({
      financialProductId: dto.financialProductId,
      ruleField: dto.ruleField,
      operator: dto.operator,
      conditionValue: dto.conditionValue,
      conditionValueTo: dto.conditionValueTo,
      scoreWeight: dto.scoreWeight,
    });

    await this.ensureProductExists(rule.financialProductId);
    this.validateRule(rule);

    const created = await this.prisma.productRule.create({
      data: {
        financialProductId: rule.financialProductId,
        ruleField: rule.ruleField,
        operator: rule.operator,
        conditionValue: rule.conditionValue,
        conditionValueTo:
          rule.operator === 'between' ? rule.conditionValueTo : null,
        scoreWeight: rule.scoreWeight,
        isActive: dto.isActive ?? true,
      },
    });

    return this.toResponse(created);
  }

  async update(id: string, dto: UpdateProductRuleDto) {
    const current = await this.prisma.productRule.findUnique({
      where: { id },
    });

    if (!current) {
      throw new ApiException(404, 'NOT_FOUND', 'Regla de producto no encontrada.');
    }

    const rule = this.normalizeRule({
      financialProductId: dto.financialProductId ?? current.financialProductId,
      ruleField: dto.ruleField ?? current.ruleField,
      operator: dto.operator ?? current.operator,
      conditionValue: dto.conditionValue ?? current.conditionValue,
      conditionValueTo:
        dto.conditionValueTo === undefined
          ? current.conditionValueTo
          : dto.conditionValueTo,
      scoreWeight: dto.scoreWeight ?? current.scoreWeight,
    });

    if (rule.financialProductId !== current.financialProductId) {
      await this.ensureProductExists(rule.financialProductId);
    }
    this.validateRule(rule);

    const updated = await this.prisma.productRule.update({
      where: { id },
      data: {
        financialProductId: dto.financialProductId,
        ruleField: dto.ruleField,
        operator: dto.operator,
        conditionValue:
          dto.conditionValue === undefined ? undefined : rule.conditionValue,
        conditionValueTo:
          rule.operator === 'between' ? rule.conditionValueTo : null,
        scoreWeight: dto.scoreWeight,
        isActive: dto.isActive,
      },
    });

    return this.toResponse(updated);
  }

  private async ensureProductExists(financialProductId: string) {
    const product = await this.prisma.financialProduct.findUnique({
      where: { id: financialProductId },
      select: { id: true },
    });

    if (!product) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El producto financiero de la regla no existe.',
        [{ field: 'financialProductId', issue: 'not_found' }],
      );
    }
  }

  private validateRule(rule: RuleForValidation) {
    if (rule.scoreWeight < -100 || rule.scoreWeight > 100) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El peso de la regla debe estar entre -100 y 100.',
        [{ field: 'scoreWeight', issue: 'range_-100_100' }],
      );
    }

    if (rule.operator === 'contains') {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El operador contains no aplica a los campos de reglas documentados.',
        [{ field: 'operator', issue: 'not_supported_for_rule_fields' }],
      );
    }

    if (rule.operator === 'between' && !rule.conditionValueTo) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El operador between requiere condition_value_to.',
        [{ field: 'conditionValueTo', issue: 'required_when_between' }],
      );
    }

    if (NUMERIC_FIELDS.has(rule.ruleField)) {
      this.validateNumericRule(rule);
      return;
    }

    if (BOOLEAN_FIELDS.has(rule.ruleField)) {
      this.validateBooleanRule(rule);
      return;
    }

    this.validateEnumRule(rule);
  }

  private validateNumericRule(rule: RuleForValidation) {
    const allowedOperators: RuleOperator[] = [
      'equals',
      'not_equals',
      'gte',
      'lte',
      'between',
    ];

    if (!allowedOperators.includes(rule.operator)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Operador invalido para campo numerico.',
        [{ field: 'operator', issue: 'invalid_for_numeric_field' }],
      );
    }

    const value = Number(rule.conditionValue);
    const valueTo =
      rule.conditionValueTo === null || rule.conditionValueTo === undefined
        ? undefined
        : Number(rule.conditionValueTo);

    if (!Number.isFinite(value)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'condition_value debe ser numerico para este campo.',
        [{ field: 'conditionValue', issue: 'numeric_required' }],
      );
    }

    if (rule.operator === 'between') {
      if (!Number.isFinite(valueTo)) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'condition_value_to debe ser numerico para between.',
          [{ field: 'conditionValueTo', issue: 'numeric_required' }],
        );
      }

      if ((valueTo as number) < value) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'condition_value_to debe ser mayor o igual a condition_value.',
          [{ field: 'conditionValueTo', issue: 'must_be_gte_conditionValue' }],
        );
      }
    }
  }

  private validateBooleanRule(rule: RuleForValidation) {
    if (!['equals', 'not_equals'].includes(rule.operator)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Operador invalido para campo booleano.',
        [{ field: 'operator', issue: 'invalid_for_boolean_field' }],
      );
    }

    if (!['true', 'false'].includes(rule.conditionValue.toLowerCase())) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'condition_value debe ser true o false para este campo.',
        [{ field: 'conditionValue', issue: 'boolean_required' }],
      );
    }

    if (rule.conditionValueTo) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'condition_value_to no aplica para campos booleanos.',
        [{ field: 'conditionValueTo', issue: 'not_allowed' }],
      );
    }
  }

  private validateEnumRule(rule: RuleForValidation) {
    if (!['equals', 'not_equals'].includes(rule.operator)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Operador invalido para campo enum.',
        [{ field: 'operator', issue: 'invalid_for_enum_field' }],
      );
    }

    const allowedValues = ENUM_VALUES_BY_FIELD[rule.ruleField] ?? [];

    if (!allowedValues.includes(rule.conditionValue)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'condition_value no es valido para este campo.',
        [{ field: 'conditionValue', issue: 'invalid_enum_value' }],
      );
    }

    if (rule.conditionValueTo) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'condition_value_to no aplica para campos enum.',
        [{ field: 'conditionValueTo', issue: 'not_allowed' }],
      );
    }
  }

  private normalizeRule(rule: RuleForValidation): RuleForValidation {
    return {
      ...rule,
      conditionValue: rule.conditionValue.trim(),
      conditionValueTo: rule.conditionValueTo?.trim() || null,
    };
  }

  private toResponse(rule: ProductRule) {
    return {
      id: rule.id,
      financialProductId: rule.financialProductId,
      ruleField: rule.ruleField,
      operator: rule.operator,
      conditionValue: rule.conditionValue,
      conditionValueTo: rule.conditionValueTo,
      scoreWeight: rule.scoreWeight,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
