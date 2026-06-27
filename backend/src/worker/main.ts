/**
 * Worker process entrypoint.
 *
 * Boots a NestJS application context (no HTTP server) that loads only the
 * modules whose services own BullMQ workers: DunningModule and
 * WebhookMonitorModule.  ECS overrides CMD to reach this file:
 *   command = ["node", "dist/worker/main.js"]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@core/prisma/prisma.module';
import { AuditLogModule } from '@core/audit-log/audit-log.module';
import { DunningModule } from '@modules/dunning/dunning.module';
import { WebhookMonitorModule } from '@modules/webhook-monitor/webhook-monitor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditLogModule,
    DunningModule,
    WebhookMonitorModule,
  ],
})
class WorkerAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['log', 'warn', 'error'],
  });

  console.log('Worker process started — BullMQ listeners active');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();
