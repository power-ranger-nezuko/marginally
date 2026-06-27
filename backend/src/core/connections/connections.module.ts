import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { AuthModule } from '@core/auth/auth.module';
import { AuditLogModule } from '@core/audit-log/audit-log.module';

@Module({
  imports: [AuthModule, AuditLogModule],
  providers: [ConnectionsService],
  controllers: [ConnectionsController],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
