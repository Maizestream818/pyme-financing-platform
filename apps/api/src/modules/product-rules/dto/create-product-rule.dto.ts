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

export class CreateProductRuleDto {
  @IsUUID('4')
  financialProductId!: string;

  @IsEnum(RuleField)
  ruleField!: RuleField;

  @IsEnum(RuleOperator)
  operator!: RuleOperator;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  conditionValue!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  conditionValueTo?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(-100)
  @Max(100)
  scoreWeight!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
