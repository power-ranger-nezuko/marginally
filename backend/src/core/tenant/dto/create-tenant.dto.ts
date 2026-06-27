import { IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { Plan } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;
}
