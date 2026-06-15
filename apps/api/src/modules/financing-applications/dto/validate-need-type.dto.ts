import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NeedType } from '@prisma/client';

export class ValidateNeedTypeDto {
  @IsEnum(NeedType)
  validatedNeedType!: NeedType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
