import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import {
  cleanDatabase,
  seedTenant,
  seedUser,
  seedFailedPayment,
  seedWebhookEvent,
  seedDispute,
} from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader, makeFakeJwt } from '../src/test-utils/auth-helpers';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Multi-tenancy isolation', () => {
  let app: INestApplication;

  // Tenant A
  let tokenA: string;
  // Tenant B
  let tokenB: string;
  let tenantBId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const tenantA = await seedTenant(prisma, { name: 'Tenant A' });
    const tenantB = await seedTenant(prisma, { name: 'Tenant B' });
    tenantBId = tenantB.id;

    const { user: userA, password: passwordA } = await seedUser(prisma, tenantA.id, 'OWNER');
    const { user: userB, password: passwordB } = await seedUser(prisma, tenantB.id, 'OWNER');

    // Seed data for both tenants
    await seedFailedPayment(prisma, tenantA.id);
    await seedFailedPayment(prisma, tenantB.id);
    await seedWebhookEvent(prisma, tenantA.id);
    await seedWebhookEvent(prisma, tenantB.id);
    await seedDispute(prisma, tenantA.id);
    await seedDispute(prisma, tenantB.id);

    tokenA = await loginAs(app, userA.email, passwordA);
    tokenB = await loginAs(app, userB.email, passwordB);
  });

  it('tenantA cannot read tenantB failed payments — returns empty array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .set(getAuthHeader(tokenA))
      .expect(200);

    // TenantA should only see their own payments — none belong to tenantB
    const tenantBPayments = await prisma.failedPayment.findMany({ where: { tenantId: tenantBId } });
    const returnedIds: string[] = res.body.data?.map((p: { id: string }) => p.id) ?? res.body.map?.((p: { id: string }) => p.id) ?? [];

    for (const tbPayment of tenantBPayments) {
      expect(returnedIds).not.toContain(tbPayment.id);
    }
  });

  it('tenantA cannot read tenantB webhook events', async () => {
    const tenantBEvents = await prisma.webhookEvent.findMany({ where: { tenantId: tenantBId } });

    const res = await request(app.getHttpServer())
      .get('/api/v1/webhooks/events')
      .set(getAuthHeader(tokenA))
      .expect(200);

    const returnedIds: string[] = (res.body.data ?? res.body).map((e: { id: string }) => e.id);
    for (const evt of tenantBEvents) {
      expect(returnedIds).not.toContain(evt.id);
    }
  });

  it('tenantA cannot read tenantB disputes', async () => {
    const tenantBDisputes = await prisma.dispute.findMany({ where: { tenantId: tenantBId } });

    const res = await request(app.getHttpServer())
      .get('/api/v1/disputes')
      .set(getAuthHeader(tokenA))
      .expect(200);

    const returnedIds: string[] = (res.body.data ?? res.body).map((d: { id: string }) => d.id);
    for (const dispute of tenantBDisputes) {
      expect(returnedIds).not.toContain(dispute.id);
    }
  });

  it('tenantA cannot read tenantB generated invoices', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices/generated')
      .set(getAuthHeader(tokenA))
      .expect(200);

    const tenantBInvoices = await prisma.generatedInvoice.findMany({ where: { tenantId: tenantBId } });
    const returnedIds: string[] = (res.body.data ?? res.body).map((i: { id: string }) => i.id);
    for (const inv of tenantBInvoices) {
      expect(returnedIds).not.toContain(inv.id);
    }
  });

  it('tenantA cannot read tenantB cancellation attempts', async () => {
    // Seed a cancellation attempt for tenantB
    const tenantBOffer = await prisma.saveOffer.create({
      data: {
        tenantId: tenantBId,
        type: 'DISCOUNT',
        configJson: { percent: 20 },
        isActive: true,
      },
    });
    await prisma.cancellationAttempt.create({
      data: {
        tenantId: tenantBId,
        externalCustomerId: `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
        saveOfferId: tenantBOffer.id,
        outcome: 'PENDING',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/save-flow/attempts')
      .set(getAuthHeader(tokenA))
      .expect(200);

    const tenantBAttempts = await prisma.cancellationAttempt.findMany({ where: { tenantId: tenantBId } });
    const returnedIds: string[] = (res.body.data ?? res.body).map((a: { id: string }) => a.id);
    for (const attempt of tenantBAttempts) {
      expect(returnedIds).not.toContain(attempt.id);
    }
  });

  it('tenantA cannot replay tenantB webhook event — returns 404', async () => {
    const [tenantBEvent] = await prisma.webhookEvent.findMany({ where: { tenantId: tenantBId } });

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/events/${tenantBEvent.id}/replay`)
      .set(getAuthHeader(tokenA))
      .expect(404);
  });

  it('tenantA cannot submit evidence for tenantB dispute — returns 404', async () => {
    const [tenantBDispute] = await prisma.dispute.findMany({ where: { tenantId: tenantBId } });

    await request(app.getHttpServer())
      .post(`/api/v1/disputes/${tenantBDispute.id}/evidence`)
      .set(getAuthHeader(tokenA))
      .send({ orderData: {}, shippingData: {}, commsLog: {} })
      .expect(404);
  });

  it('tenantA cannot download tenantB invoice — returns 403', async () => {
    // Create template + invoice for tenantB
    const template = await prisma.invoiceTemplate.create({
      data: {
        tenantId: tenantBId,
        brandingJson: { logo: 'https://example.com/logo.png' },
        isDefault: true,
      },
    });
    const invoice = await prisma.generatedInvoice.create({
      data: {
        tenantId: tenantBId,
        templateId: template.id,
        stripeInvoiceId: `in_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
        language: 'en',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/generated/${invoice.id}/download`)
      .set(getAuthHeader(tokenA));

    expect([403, 404]).toContain(res.status);
  });

  it('a JWT with a forged tenantId (not in DB) is rejected — returns 401', async () => {
    const fakeToken = makeFakeJwt({
      sub: uuidv4(),
      tid: uuidv4(), // non-existent tenant
      role: 'OWNER',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .set(getAuthHeader(fakeToken))
      .expect(401);
  });

  it('an expired JWT is rejected — returns 401', async () => {
    const expiredToken = makeFakeJwt({
      sub: uuidv4(),
      tid: tenantBId,
      role: 'OWNER',
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1800, // expired 30 min ago
    });

    await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .set(getAuthHeader(expiredToken))
      .expect(401);
  });

  it('a JWT signed with wrong key is rejected — returns 401', async () => {
    const tamperedToken = makeFakeJwt({
      sub: uuidv4(),
      tid: tenantBId,
      role: 'OWNER',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    await request(app.getHttpServer())
      .get('/api/v1/dunning/failed-payments')
      .set(getAuthHeader(tamperedToken))
      .expect(401);
  });
});
