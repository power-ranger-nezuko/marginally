import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantModule } from '@core/tenant/tenant.module';
import { AuthModule } from '@core/auth/auth.module';
import { ConnectionsModule } from '@core/connections/connections.module';
import { AuditLogModule } from '@core/audit-log/audit-log.module';
import { PrismaModule } from '@core/prisma/prisma.module';
import { KmsModule } from '@core/kms/kms.module';
import { WebhookMonitorModule } from '@modules/webhook-monitor/webhook-monitor.module';
import { DunningModule } from '@modules/dunning/dunning.module';
import { BrandedInvoicesModule } from '@modules/branded-invoices/branded-invoices.module';
import { CancellationSaveflowModule } from '@modules/cancellation-saveflow/cancellation-saveflow.module';
import { AccountingSyncModule } from '@modules/accounting-sync/accounting-sync.module';
import { DisputeEvidenceModule } from '@modules/dispute-evidence/dispute-evidence.module';
import { DemoModule } from './demo/demo.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    KmsModule,
    TenantModule,
    AuthModule,
    ConnectionsModule,
    AuditLogModule,
    WebhookMonitorModule,
    DunningModule,
    BrandedInvoicesModule,
    CancellationSaveflowModule,
    AccountingSyncModule,
    DisputeEvidenceModule,
    DemoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
