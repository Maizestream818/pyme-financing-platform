import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RuleField, RuleOperator } from '@prisma/client';

export class UpdateProductRuleDto {
  @IsOptional()
  @IsUUID('4')
  financialProductId?: string;

  @IsOptional()
  @IsEnum(RuleField)
  ruleField?: RuleField;

  @IsOptional()
  @IsEnum(RuleOperator)
  operator?: RuleOperator;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  conditionValue?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  conditionValueTo?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100)
  @Max(100)
  scoreWeight?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
