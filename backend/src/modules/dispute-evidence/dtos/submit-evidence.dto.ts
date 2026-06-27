import { IsObject, IsOptional } from 'class-validator';

export class SubmitEvidenceDto {
  @IsOptional()
  @IsObject()
  orderData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  shippingData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  commsLog?: Record<string, unknown>;
}
