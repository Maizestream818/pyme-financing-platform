import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusinessType, NeedType } from '@prisma/client';

export class CreateDocumentRequirementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsEnum(NeedType)
  appliesTo?: NeedType | null;

  @IsOptional()
  @IsEnum(BusinessType)
  appliesToBusinessType?: BusinessType | null;
}
