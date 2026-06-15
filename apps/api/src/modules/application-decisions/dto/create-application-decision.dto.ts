import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DecisionStatus } from '@prisma/client';

export class CreateApplicationDecisionDto {
  @IsUUID('4')
  riskAssessmentId!: string;

  @IsOptional()
  @IsUUID('4')
  selectedMatchId?: string | null;

  @IsEnum(DecisionStatus)
  decisionStatus!: DecisionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  approvedAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approvedTermMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedMonthlyPayment?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  publicMessage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;
}
