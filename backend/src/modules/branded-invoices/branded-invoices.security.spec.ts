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
 * Security test: Tenant A cannot download Tenant B's invoice.
 */
describe('BrandedInvoices Security', () => {
  let app: INestApplication;

  const TENANT_A = 'security-tenant-a';
  const TENANT_B = 'security-tenant-b';
  const INVOICE_B_ID = 'inv-owned-by-b';

  const fakePrisma = {
    generatedInvoice: {
      findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === INVOICE_B_ID) {
          return Promise.resolve({ id, tenantId: TENANT_B, pdfS3Key: `invoices/${TENANT_B}/x.pdf` });
        }
        return Promise.resolve(null);
      }),
    },
    invoiceTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

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

  it('Tenant A cannot download Tenant B invoice → 403', async () => {
    await request(app.getHttpServer())
      .get(`/invoices/generated/${INVOICE_B_ID}/download`)
      .expect(HttpStatus.FORBIDDEN);
  });
});
