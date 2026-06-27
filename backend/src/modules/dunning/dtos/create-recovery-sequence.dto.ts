import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecoveryStepDto {
  @IsInt()
  @Min(0)
  delayDays: number;

  @IsString()
  @IsNotEmpty()
  channel: 'email' | 'sms';

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  message?: string;
}

export class CreateRecoverySequenceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecoveryStepDto)
  steps: RecoveryStepDto[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
