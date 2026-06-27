import { IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateTemplateDto {
  @IsObject()
  brandingJson: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  localeSettings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  taxSettings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
