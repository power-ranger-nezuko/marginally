import { IsString, IsEnum, IsOptional } from 'class-validator';
import { CancellationOutcome } from '@prisma/client';

export class WidgetOfferDto {
  @IsString()
  tenantToken: string;

  @IsString()
  customerId: string;

  @IsString()
  tenantId: string;
}

export class WidgetOutcomeDto {
  @IsString()
  tenantToken: string;

  @IsString()
  customerId: string;

  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  saveOfferId?: string;

  @IsEnum(CancellationOutcome)
  outcome: CancellationOutcome;
}
