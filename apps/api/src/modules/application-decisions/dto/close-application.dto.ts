import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
