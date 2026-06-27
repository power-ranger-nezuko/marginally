import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { AuthModule } from '@core/auth/auth.module';
import { AuditLogModule } from '@core/audit-log/audit-log.module';

@Module({
  imports: [AuthModule, AuditLogModule, JwtModule],
  providers: [ConnectionsService],
  controllers: [ConnectionsController],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
