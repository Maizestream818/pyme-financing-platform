import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NeedType } from '@prisma/client';

export class UpdateFinancialProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minYearsOperating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxResponseDays?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  estimatedAnnualRate?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresInvoices?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresBankStatements?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCollateral?: boolean;

  @IsOptional()
  @IsEnum(NeedType)
  idealFor?: NeedType | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
