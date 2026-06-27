import { IsEnum } from 'class-validator';
import { Plan } from '@prisma/client';

export class UpdateTenantPlanDto {
  @IsEnum(Plan)
  plan!: Plan;
}
