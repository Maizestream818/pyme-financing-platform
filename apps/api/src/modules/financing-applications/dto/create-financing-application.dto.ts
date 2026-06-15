import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NeedType, UrgencyLevel } from '@prisma/client';

export class CreateFinancingApplicationDto {
  @IsUUID('4')
  companyId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  requestedAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  desiredTermMonths!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  fundingPurpose!: string;

  @IsEnum(UrgencyLevel)
  urgencyLevel!: UrgencyLevel;

  @IsEnum(NeedType)
  needType!: NeedType;
}
