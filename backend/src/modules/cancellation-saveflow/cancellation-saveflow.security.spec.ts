import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { createHmac } from 'crypto';
import { WidgetController } from './widget.controller';
import { CancellationSaveflowController } from './cancellation-saveflow.controller';
import { CancellationSaveflowService } from './cancellation-saveflow.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

const WIDGET_SECRET = 'security-secret';
const TENANT_A = 'sec-tenant-a';
const TENANT_B = 'sec-tenant-b';
const CUSTOMER_ID = 'cust-sec';

function makeToken(secret = WIDGET_SECRET, tenantId = TENANT_A) {
  return createHmac('sha256', secret).update(`${tenantId}:${CUSTOMER_ID}`).digest('hex');
}

const fakePrisma = {
  saveOffer: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  cancellationAttempt: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
  },
};

class TenantBGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { tid: TENANT_B, sub: 'user-b', role: 'OWNER' };
    return true;
  }
}

describe('CancellationSaveflow Security', () => {
  let widgetApp: INestApplication;
  let dashboardApp: INestApplication;

  beforeAll(async () => {
    // Widget app
    const widgetModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [WidgetController],
      providers: [
        CancellationSaveflowService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (k: string, d: string) => k === 'WIDGET_SECRET' ? WIDGET_SECRET : d } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    widgetApp = widgetModule.createNestApplication();
    await widgetApp.init();

    // Dashboard app (Tenant B JWT trying to access Tenant A data — note: in real code tenantId is scoped
    // to the JWT, so this tests that the service layer filters by tenant)
    const dashModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [CancellationSaveflowController],
      providers: [
        CancellationSaveflowService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (k: string, d: string) => k === 'WIDGET_SECRET' ? WIDGET_SECRET : d } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TenantBGuard)
      .compile();

    dashboardApp = dashModule.createNestApplication();
    await dashboardApp.init();
  });

  afterAll(async () => {
    await widgetApp.close();
    await dashboardApp.close();
  });

  afterEach(() => jest.clearAllMocks());

  it('HMAC token with wrong secret is rejected → 401', async () => {
    const badToken = makeToken('wrong-secret');
    await request(widgetApp.getHttpServer())
      .post('/widget/offer')
      .send({ tenantToken: badToken, customerId: CUSTOMER_ID, tenantId: TENANT_A })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('Tenant B cannot see Tenant A stats — stats endpoint scoped to JWT tenantId', async () => {
    // Tenant B's JWT is used; service will query DB for TENANT_B, not TENANT_A
    // The mock returns empty data for any tenant, confirming isolation
    const response = await request(dashboardApp.getHttpServer())
      .get('/save-flow/stats')
      .expect(HttpStatus.OK);

    // Verify the query was called with Tenant B's ID (not A's)
    expect(fakePrisma.cancellationAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_B }) }),
    );
    // No leak of Tenant A data
    expect(fakePrisma.cancellationAttempt.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('Rate limiting: 101st request in a minute returns 429', async () => {
    // Use separate app with limit=5 for speed
    const throttledModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])],
      controllers: [WidgetController],
      providers: [
        CancellationSaveflowService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (k: string, d: string) => k === 'WIDGET_SECRET' ? WIDGET_SECRET : d } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    const throttledApp = throttledModule.createNestApplication();
    await throttledApp.init();

    const token = makeToken();
    const body = { tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_A };

    for (let i = 0; i < 5; i++) {
      await request(throttledApp.getHttpServer()).post('/widget/offer').send(body);
    }

    await request(throttledApp.getHttpServer())
      .post('/widget/offer')
      .send(body)
      .expect(HttpStatus.TOO_MANY_REQUESTS);

    await throttledApp.close();
  });
});
