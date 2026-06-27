import { IsEnum, IsObject, IsArray, IsString } from 'class-validator';
import { Provider } from '@prisma/client';

export class CreateConnectionDto {
  @IsEnum(Provider)
  provider!: Provider;

  @IsObject()
  credentials!: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];
}
