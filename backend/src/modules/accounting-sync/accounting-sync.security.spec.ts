import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AccountingProvider } from '@prisma/client';
import { AccountingSyncController } from './accounting-sync.controller';
import { AccountingSyncService } from './accounting-sync.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { QuickBooksClient } from './quickbooks.client';
import { XeroClient } from './xero.client';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ charges: { list: jest.fn().mockResolvedValue({ data: [] }) } })),
}));

const TOKEN_PATTERN = /^(sk_|Bearer |eyJ|enc:|[a-f0-9]{40,})/;

describe('AccountingSync Security', () => {
  let app: INestApplication;

  const TENANT_ID = 'sec-acct-tenant';

  const fakeConnection = {
    id: 'conn-sec',
    tenantId: TENANT_ID,
    provider: AccountingProvider.QUICKBOOKS,
    encryptedAccessToken: 'enc:super-secret-access-token',
    encryptedRefreshToken: 'enc:super-secret-refresh-token',
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    realmId: 'realm-sec',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const fakePrisma = {
    accountingConnection: {
      findMany: jest.fn().mockResolvedValue([fakeConnection]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    connection: { findUnique: jest.fn() },
    syncedTransaction: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), upsert: jest.fn(), findUnique: jest.fn() },
  };

  class TenantGuard {
    canActivate(ctx: ExecutionContext) {
      const req = ctx.switchToHttp().getRequest();
      req.user = { tid: TENANT_ID, sub: 'u1', role: 'OWNER' };
      return true;
    }
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingSyncController],
      providers: [
        AccountingSyncService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: KmsService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: QuickBooksClient, useValue: { exchangeCodeForTokens: jest.fn(), refreshTokens: jest.fn(), createSalesReceipt: jest.fn() } },
        { provide: XeroClient, useValue: { exchangeCodeForTokens: jest.fn(), refreshTokens: jest.fn(), createInvoice: jest.fn() } },
        { provide: ConfigService, useValue: { get: (_: string, d: string) => d } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TenantGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /accounting/connections response body NEVER contains encrypted token values', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounting/connections')
      .expect(HttpStatus.OK);

    const bodyString = JSON.stringify(response.body);

    // The encrypted token strings should not appear in the response
    expect(bodyString).not.toContain('super-secret-access-token');
    expect(bodyString).not.toContain('super-secret-refresh-token');
    expect(bodyString).not.toContain('encryptedAccessToken');
    expect(bodyString).not.toContain('encryptedRefreshToken');
  });
});
