import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Stripe from 'stripe';
import { PrismaService } from '@core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PdfService } from './pdf.service';
import { CreateTemplateDto } from './dtos/create-template.dto';
import { ListGeneratedDto } from './dtos/list-generated.dto';

@Injectable()
export class BrandedInvoicesService {
  private readonly logger = new Logger(BrandedInvoicesService.name);
  private readonly stripe: Stripe;
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-06-20',
    });
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION', 'us-east-1') });
    this.bucket = config.get<string>('S3_BUCKET', 'marginly-invoices');
  }

  async listTemplates(tenantId: string) {
    return this.prisma.invoiceTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    if (dto.isDefault) {
      await this.prisma.invoiceTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.invoiceTemplate.create({
      data: {
        tenantId,
        brandingJson: dto.brandingJson as unknown as Prisma.InputJsonValue,
        localeSettings: (dto.localeSettings ?? {}) as unknown as Prisma.InputJsonValue,
        taxSettings: (dto.taxSettings ?? {}) as unknown as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async getTemplate(tenantId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!template || template.tenantId !== tenantId) {
      throw new NotFoundException('Invoice template not found');
    }
    return template;
  }

  async updateTemplate(tenantId: string, id: string, dto: Partial<CreateTemplateDto>) {
    await this.getTemplate(tenantId, id);
    if (dto.isDefault) {
      await this.prisma.invoiceTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.invoiceTemplate.update({
      where: { id },
      data: {
        ...(dto.brandingJson !== undefined && { brandingJson: dto.brandingJson as unknown as Prisma.InputJsonValue }),
        ...(dto.localeSettings !== undefined && { localeSettings: dto.localeSettings as unknown as Prisma.InputJsonValue }),
        ...(dto.taxSettings !== undefined && { taxSettings: dto.taxSettings as unknown as Prisma.InputJsonValue }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async deleteTemplate(tenantId: string, id: string) {
    await this.getTemplate(tenantId, id);
    await this.prisma.invoiceTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  async listGeneratedInvoices(tenantId: string, dto: ListGeneratedDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.generatedInvoice.findMany({
        where: { tenantId },
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.generatedInvoice.count({ where: { tenantId } }),
    ]);
    return { items, total, page, limit };
  }

  async getSignedDownloadUrl(tenantId: string, invoiceId: string): Promise<{ url: string }> {
    const invoice = await this.prisma.generatedInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new ForbiddenException('Invoice not found or access denied');
    }
    if (!invoice.pdfS3Key) {
      throw new NotFoundException('PDF not yet generated for this invoice');
    }
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: invoice.pdfS3Key,
      });
      const url = await getSignedUrl(this.s3, command, { expiresIn: 900 });
      return { url };
    } catch {
      // No AWS credentials in dev — return the S3 key as a placeholder URL
      this.logger.warn(`S3 signing unavailable; returning placeholder for ${invoice.pdfS3Key}`);
      return { url: `s3://${this.bucket}/${invoice.pdfS3Key}` };
    }
  }

  async generateInvoice(tenantId: string, stripeInvoiceId: string) {
    // Fetch Stripe invoice
    const stripeInvoice = await this.stripe.invoices.retrieve(stripeInvoiceId, {
      expand: ['lines', 'customer'],
    });

    // Get default template for tenant
    const template = await this.prisma.invoiceTemplate.findFirst({
      where: { tenantId, isDefault: true },
    });
    if (!template) {
      throw new NotFoundException('No default invoice template found for tenant');
    }

    const { s3Key } = await this.pdfService.generateInvoicePdf(
      template.id,
      template.brandingJson as Record<string, unknown>,
      stripeInvoice as unknown as Record<string, unknown>,
      tenantId,
      stripeInvoiceId,
    );

    // Upsert GeneratedInvoice row
    const generated = await this.prisma.generatedInvoice.upsert({
      where: { tenantId_stripeInvoiceId: { tenantId, stripeInvoiceId } },
      create: {
        tenantId,
        templateId: template.id,
        stripeInvoiceId,
        pdfS3Key: s3Key,
      },
      update: { pdfS3Key: s3Key, generatedAt: new Date() },
    });

    return generated;
  }
}
