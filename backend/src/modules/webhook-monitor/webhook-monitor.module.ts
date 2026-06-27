import { Module } from '@nestjs/common';
import { WebhookMonitorController } from './webhook-monitor.controller';
import { WebhookMonitorService } from './webhook-monitor.service';
import { AuditLogModule } from '@core/audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [WebhookMonitorController],
  providers: [WebhookMonitorService],
  exports: [WebhookMonitorService],
})
export class WebhookMonitorModule {}
