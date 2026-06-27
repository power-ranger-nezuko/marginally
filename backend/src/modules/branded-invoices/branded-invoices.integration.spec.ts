import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { BrandedInvoicesController } from './branded-invoices.controller';
import { BrandedInvoicesService } from './branded-invoices.service';
import { PdfService } from './pdf.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

/**
 * Integration test: GET /invoices/generated/:id/download
 * Tenant A's JWT cannot download Tenant B's invoice.
 */
describe('BrandedInvoices Integration', () => {
  let app: INestApplication;

  const TENANT_A = 'tenant-a';
  const TENANT_B = 'tenant-b';
  const INVOICE_B = 'invoice-owned-by-B';

  const fakePrisma = {
    generatedInvoice: {
      findUnique: jest.fn().mockResolvedValue({
        id: INVOICE_B,
        tenantId: TENANT_B,
        pdfS3Key: `invoices/${TENANT_B}/inv.pdf`,
      }),
    },
    invoiceTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  // Guard that injects Tenant A context
  class TenantAGuard {
    canActivate(ctx: ExecutionContext) {
      const req = ctx.switchToHttp().getRequest();
      req.user = { tenantId: TENANT_A, userId: 'user-a', role: 'OWNER' };
      return true;
    }
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandedInvoicesController],
      providers: [
        BrandedInvoicesService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: PdfService, useValue: {} },
        { provide: ConfigService, useValue: { get: (_: string, d: string) => d } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TenantAGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /invoices/generated/:id/download → 403 when invoice belongs to different tenant', async () => {
    const response = await request(app.getHttpServer())
      .get(`/invoices/generated/${INVOICE_B}/download`)
      .expect(HttpStatus.FORBIDDEN);

    // Error should not reveal that the resource exists or expose tenant info
    expect(response.body.message).toMatch(/access denied/i);
    expect(JSON.stringify(response.body)).not.toContain(TENANT_B);
    expect(JSON.stringify(response.body)).not.toContain(INVOICE_B);
  });
});
