import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { ThrottlerStorageService, getStorageToken, getOptionsToken } from '@nestjs/throttler';
import { createHmac } from 'crypto';
import { WidgetController } from './widget.controller';
import { CancellationSaveflowService } from './cancellation-saveflow.service';

const WIDGET_SECRET = 'test-secret';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'cust-1';

function makeToken(tenantId = TENANT_ID, customerId = CUSTOMER_ID) {
  return createHmac('sha256', WIDGET_SECRET).update(`${tenantId}:${customerId}`).digest('hex');
}

function buildMockService() {
  return {
    validateTenantToken: jest.fn(), // does not throw → passes validation
    getActiveOffer: jest.fn().mockResolvedValue({ id: 'offer-1', type: 'DISCOUNT' }),
  };
}

/**
 * Creates a fresh NestJS app with a ThrottlerGuard at the given limit.
 * Each test that needs rate-limit isolation should call this directly.
 */
async function buildApp(limit: number): Promise<INestApplication> {
  // Do NOT import ThrottlerModule.forRoot — its @Global() registration would share
  // ThrottlerStorageService across buildApp() calls. Instead, wire everything directly
  // so each app gets a completely isolated storage instance.
  const freshStorage = new ThrottlerStorageService();
  const module: TestingModule = await Test.createTestingModule({
    controllers: [WidgetController],
    providers: [
      { provide: CancellationSaveflowService, useValue: buildMockService() },
      { provide: getStorageToken(), useValue: freshStorage },
      { provide: getOptionsToken(), useValue: [{ ttl: 60000, limit }] },
    ],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('WidgetController', () => {
  describe('basic routing', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await buildApp(100); // high limit — not testing throttling here
    });

    afterAll(() => app.close());
    afterEach(() => jest.clearAllMocks());

    it('returns 200 for valid HMAC token on first request', async () => {
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/widget/offer')
        .send({ tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_ID })
        .expect(HttpStatus.OK);
    });

    it('returns the active offer in the response body', async () => {
      const token = makeToken();
      const res = await request(app.getHttpServer())
        .post('/widget/offer')
        .send({ tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_ID })
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({ offer: { id: 'offer-1', type: 'DISCOUNT' } });
    });
  });

  describe('rate limiting', () => {
    // Each test in this block uses its own fresh app so throttle counters never bleed.
    afterEach(() => jest.clearAllMocks());

    it('returns 429 after exceeding the rate limit', async () => {
      const app = await buildApp(5);

      try {
        const token = makeToken();
        const body = { tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_ID };

        // Exhaust exactly the allowed limit
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer()).post('/widget/offer').send(body);
          expect(res.status).toBe(HttpStatus.OK);
        }

        // One beyond the limit must be blocked
        const blocked = await request(app.getHttpServer()).post('/widget/offer').send(body);
        expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      } finally {
        await app.close();
      }
    });

    it('requests within the limit all succeed', async () => {
      const app = await buildApp(3);

      try {
        const token = makeToken();
        const body = { tenantToken: token, customerId: CUSTOMER_ID, tenantId: TENANT_ID };

        for (let i = 0; i < 3; i++) {
          const res = await request(app.getHttpServer()).post('/widget/offer').send(body);
          expect(res.status).toBe(HttpStatus.OK);
        }
      } finally {
        await app.close();
      }
    });
  });
});
