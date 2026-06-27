import { IsString } from 'class-validator';

export class ConnectQuickBooksDto {
  @IsString()
  authCode: string;

  @IsString()
  realmId: string;
}
