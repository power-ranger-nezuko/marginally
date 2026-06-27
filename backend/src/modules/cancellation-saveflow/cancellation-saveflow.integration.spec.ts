import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { createHmac } from 'crypto';
import { WidgetController } from './widget.controller';
import { CancellationSaveflowService } from './cancellation-saveflow.service';
import { PrismaService } from '@core/prisma/prisma.service';

const WIDGET_SECRET = 'integration-secret';
const TENANT_ID = 'tenant-int-1';
const CUSTOMER_ID = 'cust-int-1';

function makeToken(secret = WIDGET_SECRET, tenantId = TENANT_ID, customerId = CUSTOMER_ID) {
  return createHmac('sha256', secret).update(`${tenantId}:${customerId}`).digest('hex');
}

const fakePrisma = {
  saveOffer: { findFirst: jest.fn() },
  cancellationAttempt: { create: jest.fn() },
};

describe('SaveFlow Widget Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [WidgetController],
      providers: [
        CancellationSaveflowService,
        { provide: PrismaService, useValue: fakePrisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: string) =>
              key === 'WIDGET_SECRET' ? WIDGET_SECRET : def,
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /widget/offer with invalid tenantToken → 401', async () => {
    const badToken = makeToken('wrong-secret');
    await request(app.getHttpServer())
      .post('/widget/offer')
      .send({ tenantToken: badToken, customerId: CUSTOMER_ID, tenantId: TENANT_ID })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('POST /widget/offer with valid token → 200 with offer', async () => {
    const offer = { id: 'offer-1', type: 'DISCOUNT', configJson: { discountAmount: 10 }, isActive: true };
    fakePrisma.saveOffer.findFirst.mockResolvedValue(offer);

    const token = makeToken();
    const response = await request(app.getHttpServer())
      .post('/widget/offer')
      .send({ tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_ID })
      .expect(HttpStatus.OK);

    expect(response.body.offer).toMatchObject({ id: 'offer-1', type: 'DISCOUNT' });
  });
});
