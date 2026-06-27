/**
 * PDF worker process entrypoint.
 *
 * Boots a NestJS application context (no HTTP server) that loads only the
 * BrandedInvoicesModule, which owns the Puppeteer-based PDF generation
 * service.  ECS overrides CMD to reach this file:
 *   command = ["node", "dist/pdf/main.js"]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@core/prisma/prisma.module';
import { AuditLogModule } from '@core/audit-log/audit-log.module';
import { BrandedInvoicesModule } from '@modules/branded-invoices/branded-invoices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditLogModule,
    BrandedInvoicesModule,
  ],
})
class PdfAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(PdfAppModule, {
    logger: ['log', 'warn', 'error'],
  });

  console.log('PDF worker started — invoice generation ready');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();
