import { Module } from '@nestjs/common';
import { DunningController } from './dunning.controller';
import { DunningService } from './dunning.service';
import { DunningScheduler } from './dunning.scheduler';
import { AuditLogModule } from '@core/audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [DunningController],
  providers: [DunningService, DunningScheduler],
  exports: [DunningService],
})
export class DunningModule {}
