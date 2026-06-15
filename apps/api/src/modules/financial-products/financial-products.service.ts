import { Injectable } from '@nestjs/common';
import { FinancialProduct, Prisma } from '@prisma/client';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateFinancialProductDto } from './dto/create-financial-product.dto';
import { UpdateFinancialProductDto } from './dto/update-financial-product.dto';

type ProductForValidation = {
  minAmount: number;
  maxAmount: number;
  minYearsOperating: number;
  estimatedAnnualRate?: number | null;
  isActive: boolean;
};

@Injectable()
export class FinancialProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const products = await this.prisma.financialProduct.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return products.map((product) => this.toResponse(product));
  }

  async create(dto: CreateFinancialProductDto) {
    await this.ensureNameIsAvailable(dto.name);

    const productForValidation = {
      minAmount: dto.minAmount,
      maxAmount: dto.maxAmount,
      minYearsOperating: dto.minYearsOperating,
      estimatedAnnualRate: dto.estimatedAnnualRate,
      isActive: dto.isActive ?? true,
    };
    this.validateProduct(productForValidation);

    const product = await this.prisma.financialProduct.create({
      data: {
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        minAmount: new Prisma.Decimal(dto.minAmount),
        maxAmount: new Prisma.Decimal(dto.maxAmount),
        minYearsOperating: new Prisma.Decimal(dto.minYearsOperating),
        maxResponseDays: dto.maxResponseDays ?? null,
        estimatedAnnualRate:
          dto.estimatedAnnualRate === undefined
            ? null
            : new Prisma.Decimal(dto.estimatedAnnualRate),
        requiresInvoices: dto.requiresInvoices ?? false,
        requiresBankStatements: dto.requiresBankStatements ?? true,
        requiresCollateral: dto.requiresCollateral ?? false,
        idealFor: dto.idealFor ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.toResponse(product);
  }

  async update(id: string, dto: UpdateFinancialProductDto) {
    const current = await this.prisma.financialProduct.findUnique({
      where: { id },
    });

    if (!current) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Producto financiero no encontrado.',
      );
    }

    if (dto.name && dto.name.trim() !== current.name) {
      await this.ensureNameIsAvailable(dto.name, id);
    }

    const productForValidation = {
      minAmount:
        dto.minAmount === undefined
          ? this.requiredDecimalToNumber(current.minAmount)
          : dto.minAmount,
      maxAmount:
        dto.maxAmount === undefined
          ? this.requiredDecimalToNumber(current.maxAmount)
          : dto.maxAmount,
      minYearsOperating:
        dto.minYearsOperating === undefined
          ? this.requiredDecimalToNumber(current.minYearsOperating)
          : dto.minYearsOperating,
      estimatedAnnualRate:
        dto.estimatedAnnualRate === undefined
          ? this.decimalToNumber(current.estimatedAnnualRate)
          : dto.estimatedAnnualRate,
      isActive: dto.isActive ?? current.isActive,
    };
    this.validateProduct(productForValidation);

    const product = await this.prisma.financialProduct.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        description:
          dto.description === undefined
            ? undefined
            : this.optionalTrim(dto.description),
        minAmount:
          dto.minAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.minAmount),
        maxAmount:
          dto.maxAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.maxAmount),
        minYearsOperating:
          dto.minYearsOperating === undefined
            ? undefined
            : new Prisma.Decimal(dto.minYearsOperating),
        maxResponseDays: dto.maxResponseDays,
        estimatedAnnualRate:
          dto.estimatedAnnualRate === undefined
            ? undefined
            : dto.estimatedAnnualRate === null
              ? null
              : new Prisma.Decimal(dto.estimatedAnnualRate),
        requiresInvoices: dto.requiresInvoices,
        requiresBankStatements: dto.requiresBankStatements,
        requiresCollateral: dto.requiresCollateral,
        idealFor: dto.idealFor === undefined ? undefined : dto.idealFor,
        isActive: dto.isActive,
      },
    });

    return this.toResponse(product);
  }

  async findRules(id: string) {
    const product = await this.prisma.financialProduct.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Producto financiero no encontrado.',
      );
    }

    const rules = await this.prisma.productRule.findMany({
      where: { financialProductId: id },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });

    return rules.map((rule) => ({
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
    }));
  }

  private validateProduct(product: ProductForValidation) {
    if (product.maxAmount < product.minAmount) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El rango de monto del producto es invalido.',
        [{ field: 'maxAmount', issue: 'must_be_gte_minAmount' }],
      );
    }

    if (product.minYearsOperating < 0) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'La antiguedad minima no puede ser negativa.',
        [{ field: 'minYearsOperating', issue: 'min_0' }],
      );
    }

    if (product.isActive && !product.estimatedAnnualRate) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Un producto activo debe tener estimated_annual_rate.',
        [{ field: 'estimatedAnnualRate', issue: 'required_when_active' }],
      );
    }
  }

  private async ensureNameIsAvailable(name: string, currentId?: string) {
    const existing = await this.prisma.financialProduct.findUnique({
      where: { name: name.trim() },
      select: { id: true },
    });

    if (existing && existing.id !== currentId) {
      throw new ApiException(
        409,
        'DUPLICATE_RESOURCE',
        'Ya existe un producto financiero con ese nombre.',
        [{ field: 'name', issue: 'unique' }],
      );
    }
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return value === null ? null : Number(value.toString());
  }

  private requiredDecimalToNumber(value: Prisma.Decimal) {
    return Number(value.toString());
  }

  private toResponse(product: FinancialProduct) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      minAmount: product.minAmount.toString(),
      maxAmount: product.maxAmount.toString(),
      minYearsOperating: product.minYearsOperating.toString(),
      maxResponseDays: product.maxResponseDays,
      estimatedAnnualRate: product.estimatedAnnualRate?.toString() ?? null,
      requiresInvoices: product.requiresInvoices,
      requiresBankStatements: product.requiresBankStatements,
      requiresCollateral: product.requiresCollateral,
      idealFor: product.idealFor,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
