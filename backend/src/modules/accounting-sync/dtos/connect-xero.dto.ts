import { IsString } from 'class-validator';

export class ConnectXeroDto {
  @IsString()
  authCode: string;
}
