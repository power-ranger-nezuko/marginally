import { IsEnum, IsObject, IsOptional, IsBoolean } from 'class-validator';
import { SaveOfferType } from '@prisma/client';

export class CreateOfferDto {
  @IsEnum(SaveOfferType)
  type: SaveOfferType;

  @IsObject()
  configJson: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
