import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import { cleanDatabase, seedTenant, seedUser, seedFailedPayment } from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader } from '../src/test-utils/auth-helpers';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Dunning recovery E2E', () => {
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

  it('GET /dunning/failed-payments returns only this tenant payments', async () => {
    await seedFailedPayment(prisma, tenantId);

    // Seed another tenant's payment that must not appear
    const otherTenant = await seedTenant(prisma, { name: 'Other Tenant' });
    await seedFailedPayment(prisma, otherTenant.id);

    const res = await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .set(getAuthHeader(token))
      .expect(200);

    const payments: { tenantId: string }[] = res.body.data ?? res.body;
    expect(payments.length).toBe(1);
    expect(payments[0].tenantId).toBe(tenantId);
  });

  it('POST /dunning/recovery-sequences creates a sequence', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dunning/recovery-sequences')
      .set(getAuthHeader(token))
      .send({
        name: 'Standard Recovery',
        stepsJson: [
          { day: 1, channel: 'EMAIL', template: 'first_reminder' },
          { day: 3, channel: 'EMAIL', template: 'second_reminder' },
          { day: 7, channel: 'SMS', template: 'final_notice' },
        ],
        isDefault: false,
      })
      .expect(201);

    expect(res.body).toMatchObject({ name: 'Standard Recovery', tenantId });

    const seq = await prisma.recoverySequence.findFirst({
      where: { tenantId, name: 'Standard Recovery' },
    });
    expect(seq).not.toBeNull();
    expect(seq!.stepsJson).toHaveLength(3);
  });

  it('GET /dunning/stats returns zero counts for new tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dunning/stats')
      .set(getAuthHeader(token))
      .expect(200);

    expect(res.body).toMatchObject({
      totalFailed: 0,
      totalRecovered: 0,
      totalWrittenOff: 0,
    });
  });

  it('dunning stats update after a payment is marked RECOVERED', async () => {
    const payment = await seedFailedPayment(prisma, tenantId);

    // Update to RECOVERED via the API
    await request(app.getHttpServer())
      .patch(`/api/v1/dunning/failed-payments/${payment.id}`)
      .set(getAuthHeader(token))
      .send({ status: 'RECOVERED' })
      .expect(200);

    const statsRes = await request(app.getHttpServer())
      .get('/api/v1/dunning/stats')
      .set(getAuthHeader(token))
      .expect(200);

    expect(statsRes.body.totalRecovered).toBeGreaterThanOrEqual(1);

    const updated = await prisma.failedPayment.findUnique({ where: { id: payment.id } });
    expect(updated!.status).toBe('RECOVERED');
  });

  it('GET /dunning/failed-payments without JWT returns 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .expect(401);
  });
});
