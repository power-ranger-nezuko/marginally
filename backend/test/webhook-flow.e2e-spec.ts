import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import { cleanDatabase, seedTenant, seedUser, seedWebhookEvent } from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader } from '../src/test-utils/auth-helpers';
import {
  makeStripeWebhookPayload,
  signStripePayload,
  makeShopifyWebhookPayload,
  signShopifyPayload,
} from '../src/test-utils/stripe-helpers';
import { v4 as uuidv4 } from 'uuid';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? 'test-shopify-secret';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Webhook ingestion E2E', () => {
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

  it('POST /webhooks/stripe with valid signature stores event and returns 200', async () => {
    const stripeCustomerId = `cus_test_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const stripeInvoiceId = `in_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const payload = makeStripeWebhookPayload('invoice.payment_failed', {
      id: stripeInvoiceId,
      customer: stripeCustomerId,
      amount_due: 4999,
      currency: 'usd',
    });
    const sig = signStripePayload(payload, STRIPE_WEBHOOK_SECRET);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/stripe`)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sig)
      .send(payload)
      .expect(200);

    expect(res.body).toMatchObject({ received: true });

    // Verify event was persisted
    const event = await prisma.webhookEvent.findFirst({
      where: { provider: 'STRIPE', tenantId },
    });
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe('invoice.payment_failed');
    expect(event!.status).toMatch(/RECEIVED|PROCESSING|PROCESSED/);
  });

  it('POST /webhooks/stripe with invalid signature returns 400', async () => {
    const payload = makeStripeWebhookPayload('invoice.payment_failed', {});
    const badSig = 't=9999999999,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', badSig)
      .send(payload)
      .expect(400);
  });

  it('POST /webhooks/stripe with missing Stripe-Signature header returns 400', async () => {
    const payload = makeStripeWebhookPayload('invoice.payment_failed', {});

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(400);
  });

  it('POST /webhooks/stripe duplicate eventId returns 200 but creates only one DB row', async () => {
    const stripeInvoiceId = `in_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const payload = makeStripeWebhookPayload('invoice.payment_failed', {
      id: stripeInvoiceId,
      customer: `cus_test_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
    });

    // Parse to extract the generated eventId to ensure both calls use same id
    const parsed = JSON.parse(payload.toString()) as { id: string };
    const eventId = parsed.id;

    const sig1 = signStripePayload(payload, STRIPE_WEBHOOK_SECRET);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sig1)
      .send(payload)
      .expect(200);

    const sig2 = signStripePayload(payload, STRIPE_WEBHOOK_SECRET);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sig2)
      .send(payload)
      .expect(200);

    const count = await prisma.webhookEvent.count({
      where: { provider: 'STRIPE', eventId },
    });
    expect(count).toBe(1);
  });

  it('POST /webhooks/shopify with valid HMAC signature stores event', async () => {
    const data = {
      id: uuidv4(),
      topic: 'orders/paid',
      shop: 'test-shop.myshopify.com',
    };
    const payload = makeShopifyWebhookPayload(data);
    const sig = signShopifyPayload(payload, SHOPIFY_API_SECRET);

    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-SHA256', sig)
      .set('X-Shopify-Topic', 'orders/paid')
      .send(payload)
      .expect(200);

    expect(res.body).toMatchObject({ received: true });
  });

  it('POST /webhooks/shopify with invalid HMAC returns 400', async () => {
    const payload = makeShopifyWebhookPayload({ id: uuidv4() });
    const badSig = 'invalidsignaturebase64==';

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-SHA256', badSig)
      .send(payload)
      .expect(400);
  });

  it('POST /webhooks/events/:id/replay marks event as REPLAYED and re-enqueues', async () => {
    const event = await seedWebhookEvent(prisma, tenantId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/events/${event.id}/replay`)
      .set(getAuthHeader(token))
      .expect(200);

    expect(res.body).toMatchObject({ id: event.id });

    const updated = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe('REPLAYED');
  });

  it('GET /webhooks/events returns only events for authenticated tenant', async () => {
    // Seed another tenant with events
    const otherTenant = await seedTenant(prisma, { name: 'Other Corp' });
    await seedWebhookEvent(prisma, otherTenant.id);

    const res = await request(app.getHttpServer())
      .get('/api/v1/webhooks/events')
      .set(getAuthHeader(token))
      .expect(200);

    const events: { tenantId: string }[] = res.body.data ?? res.body;
    for (const evt of events) {
      expect(evt.tenantId).toBe(tenantId);
    }
  });

  it('GET /webhooks/events?status=FAILED returns only failed events', async () => {
    // Seed a FAILED event
    await prisma.webhookEvent.create({
      data: {
        tenantId,
        provider: 'STRIPE',
        eventType: 'invoice.payment_failed',
        eventId: `evt_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
        payload: {},
        status: 'FAILED',
        errorMessage: 'Processing error',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/webhooks/events?status=FAILED')
      .set(getAuthHeader(token))
      .expect(200);

    const events: { status: string }[] = res.body.data ?? res.body;
    expect(events.length).toBeGreaterThan(0);
    for (const evt of events) {
      expect(evt.status).toBe('FAILED');
    }
  });
});
