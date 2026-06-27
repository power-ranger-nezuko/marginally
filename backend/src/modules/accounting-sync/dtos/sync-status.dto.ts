import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncStatus } from '@prisma/client';

export class SyncStatusQueryDto {
  @IsOptional()
  @IsEnum(SyncStatus)
  status?: SyncStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
