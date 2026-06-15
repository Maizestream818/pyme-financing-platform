import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CreditHistoryStatus } from '@prisma/client';

export class UpdateFinancialInfoDto {
  @IsOptional()
  @IsBoolean()
  hasInvoices?: boolean;

  @IsOptional()
  @IsBoolean()
  hasExistingDebt?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  existingDebtAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyDebtPayment?: number;

  @IsOptional()
  @IsBoolean()
  creditCheckAuthorized?: boolean;

  @IsOptional()
  @IsEnum(CreditHistoryStatus)
  creditHistoryStatus?: CreditHistoryStatus;

  @IsOptional()
  @IsBoolean()
  hasCollateral?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  collateralType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  collateralEstimatedValue?: number;

  @IsOptional()
  @IsBoolean()
  hasGuarantor?: boolean;
}
