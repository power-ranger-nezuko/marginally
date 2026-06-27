import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrandedInvoicesController } from './branded-invoices.controller';
import { BrandedInvoicesService } from './branded-invoices.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [ConfigModule],
  controllers: [BrandedInvoicesController],
  providers: [BrandedInvoicesService, PdfService],
  exports: [BrandedInvoicesService],
})
export class BrandedInvoicesModule {}
