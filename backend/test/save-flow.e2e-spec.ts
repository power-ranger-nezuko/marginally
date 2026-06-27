import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { createTestApp } from '../src/test-utils/test-app.factory';
import { cleanDatabase, seedTenant, seedUser } from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader } from '../src/test-utils/auth-helpers';
import { v4 as uuidv4 } from 'uuid';

const WIDGET_SECRET = process.env.WIDGET_SECRET ?? 'test-widget-secret';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

function makeWidgetHmacToken(tenantId: string, customerId: string): string {
  const payload = `${tenantId}:${customerId}`;
  return crypto.createHmac('sha256', WIDGET_SECRET).update(payload).digest('hex');
}

describe('Cancellation save-flow E2E', () => {
  let app: INestApplication;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const tenant = await seedTenant(prisma);
    tenantId = tenant.id;
    const { user, password } = await seedUser(prisma, tenantId, 'OWNER');
    token = await loginAs(app, user.email, password);
  });

  it('POST /save-flow/offers creates a DISCOUNT offer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/save-flow/offers')
      .set(getAuthHeader(token))
      .send({
        type: 'DISCOUNT',
        configJson: { percent: 25, durationMonths: 3 },
        isActive: true,
      })
      .expect(201);

    expect(res.body).toMatchObject({ type: 'DISCOUNT', tenantId, isActive: true });
    expect(res.body.configJson).toMatchObject({ percent: 25 });

    const offer = await prisma.saveOffer.findUnique({ where: { id: res.body.id } });
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe('DISCOUNT');
  });

  it('GET /save-flow/stats returns correct saved/churned counts', async () => {
    const offer = await prisma.saveOffer.create({
      data: {
        tenantId,
        type: 'DISCOUNT',
        configJson: { percent: 20 },
        isActive: true,
      },
    });

    // Seed one SAVED and one CHURNED attempt
    await prisma.cancellationAttempt.createMany({
      data: [
        {
          tenantId,
          externalCustomerId: `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
          saveOfferId: offer.id,
          outcome: 'SAVED',
        },
        {
          tenantId,
          externalCustomerId: `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
          outcome: 'CHURNED',
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/save-flow/stats')
      .set(getAuthHeader(token))
      .expect(200);

    expect(res.body).toMatchObject({ saved: 1, churned: 1 });
  });

  it('POST /widget/offer with valid HMAC token returns active offer', async () => {
    const customerId = `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    await prisma.saveOffer.create({
      data: {
        tenantId,
        type: 'DISCOUNT',
        configJson: { percent: 30 },
        isActive: true,
      },
    });

    const hmacToken = makeWidgetHmacToken(tenantId, customerId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/widget/offer')
      .send({ tenantId, customerId, hmacToken })
      .expect(200);

    expect(res.body).toHaveProperty('type');
    expect(res.body).not.toHaveProperty('tenantId'); // should not leak tenant info
  });

  it('POST /widget/offer with invalid HMAC token returns 401', async () => {
    const customerId = `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const badToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await request(app.getHttpServer())
      .post('/api/v1/widget/offer')
      .send({ tenantId, customerId, hmacToken: badToken })
      .expect(401);
  });

  it('POST /widget/outcome records cancellation attempt', async () => {
    const customerId = `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const hmacToken = makeWidgetHmacToken(tenantId, customerId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/widget/outcome')
      .send({ tenantId, customerId, hmacToken, outcome: 'CHURNED' })
      .expect(201);

    expect(res.body).toMatchObject({ outcome: 'CHURNED' });

    const attempt = await prisma.cancellationAttempt.findFirst({
      where: { tenantId, externalCustomerId: customerId },
    });
    expect(attempt).not.toBeNull();
    expect(attempt!.outcome).toBe('CHURNED');
  });

  it('POST /widget/offer after 101 requests in 1 minute returns 429', async () => {
    const customerId = `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const hmacTokenFn = () => makeWidgetHmacToken(tenantId, customerId);

    // Fire 100 requests (expect mix of 200/404 since no offer may exist)
    const batch = Array.from({ length: 100 }, () =>
      request(app.getHttpServer())
        .post('/api/v1/widget/offer')
        .send({ tenantId, customerId, hmacToken: hmacTokenFn() }),
    );
    await Promise.all(batch);

    // 101st should be rate-limited
    const res = await request(app.getHttpServer())
      .post('/api/v1/widget/offer')
      .send({ tenantId, customerId, hmacToken: hmacTokenFn() });

    expect(res.status).toBe(429);
  });
});
