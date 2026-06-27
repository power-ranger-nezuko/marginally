import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuditLogModule } from '@core/audit-log/audit-log.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => {
        const privateKey = process.env.JWT_PRIVATE_KEY
          ? Buffer.from(process.env.JWT_PRIVATE_KEY, 'base64').toString('utf-8')
          : '';
        return {
          privateKey,
          signOptions: { algorithm: 'RS256', expiresIn: '15m' },
        };
      },
    }),
    AuditLogModule,
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
