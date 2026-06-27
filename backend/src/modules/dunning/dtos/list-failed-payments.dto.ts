import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FailedPaymentStatus } from '@prisma/client';

export class ListFailedPaymentsDto {
  @IsOptional()
  @IsEnum(FailedPaymentStatus)
  status?: FailedPaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
