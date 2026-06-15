import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NeedType, UrgencyLevel } from '@prisma/client';

export class UpdateFinancingApplicationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  requestedAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  desiredTermMonths?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  fundingPurpose?: string;

  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgencyLevel?: UrgencyLevel;

  @IsOptional()
  @IsEnum(NeedType)
  needType?: NeedType;
}
