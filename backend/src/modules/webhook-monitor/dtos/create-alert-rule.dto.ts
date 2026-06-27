import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  conditionJson: Record<string, unknown>;

  @IsString()
  @IsIn(['slack', 'email'])
  notificationChannel: string;

  @IsString()
  @IsNotEmpty()
  notificationTarget: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
