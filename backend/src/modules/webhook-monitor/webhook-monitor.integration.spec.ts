/**
 * Integration tests for webhook-monitor endpoints.
 *
 * Uses an in-process NestJS app with mocked Prisma/queue dependencies
 * to test the full HTTP→service→DB path for idempotency and error handling.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { WebhookMonitorController } from './webhook-monitor.controller';
import { WebhookMonitorService } from './webhook-monitor.service';
import { WebhookProvider, WebhookStatus } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

// ── Mock bullmq so no Redis connections are made ─────────────────────────────

const mockQueueAdd = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function buildStripeSignature(secret: string, rawBody: Buffer) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${ts}.${rawBody.toString()}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

const STRIPE_SECRET = 'whsec_integration_test';

// ── Shared mocks ──────────────────────────────────────────────────────────────

const db: Record<string, { provider: WebhookProvider; eventId: string; status: WebhookStatus }> = {};

const mockPrisma = {
  webhookEvent: {
    findUnique: jest.fn().mockImplementation(({ where }: any) => {
      const key = `${where.provider_eventId.provider}:${where.provider_eventId.eventId}`;
      return Promise.resolve(db[key] ?? null);
    }),
    create: jest.fn().mockImplementation(({ data }: any) => {
      const key = `${data.provider}:${data.eventId}`;
      const row = { id: `id-${Object.keys(db).length}`, ...data };
      db[key] = row as any;
      return Promise.resolve(row);
    }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  alertRule: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    delete: jest.fn(),
  },
};

const mockAuditLog = { log: jest.fn() };

describe('WebhookMonitor Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookMonitorController],
      providers: [
        WebhookMonitorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    // Populate req.rawBody for the octet-stream Stripe endpoint before NestJS body parsers run.
    app.use('/webhooks/stripe', (req: any, _res: any, next: any) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.keys(db).forEach((k) => delete db[k]);
    jest.clearAllMocks();
    mockQueueAdd.mockResolvedValue(undefined);
  });

  // ── Invalid signature → 400 ───────────────────────────────────────────────

  it('POST /webhooks/stripe with invalid signature returns 400', async () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_bad', type: 'test' }));

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/octet-stream')
      .set('stripe-signature', 't=123,v1=badsig')
      .send(body)
      .expect(400);
  });

  // ── Valid signature, new event → stored + queued ──────────────────────────

  it('POST /webhooks/stripe with valid signature creates one DB row', async () => {
    const stripeBody = Buffer.from(
      JSON.stringify({
        id: 'evt_unique_001',
        type: 'invoice.payment_failed',
        data: { object: { metadata: { tenantId: 'tenant-abc' } } },
      }),
    );
    const sig = buildStripeSignature(STRIPE_SECRET, stripeBody);

    const res = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/octet-stream')
      .set('stripe-signature', sig)
      .send(stripeBody)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  // ── Idempotency: same event twice → one DB row ────────────────────────────

  it('POST /webhooks/stripe same eventId twice → idempotent (one row)', async () => {
    const stripeBody = Buffer.from(
      JSON.stringify({
        id: 'evt_duplicate_001',
        type: 'invoice.payment_failed',
        data: { object: { metadata: { tenantId: 'tenant-abc' } } },
      }),
    );

    // First call
    const sig1 = buildStripeSignature(STRIPE_SECRET, stripeBody);
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/octet-stream')
      .set('stripe-signature', sig1)
      .send(stripeBody)
      .expect(200);

    // Second call — same event ID, new timestamp in sig
    const sig2 = buildStripeSignature(STRIPE_SECRET, stripeBody);
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/octet-stream')
      .set('stripe-signature', sig2)
      .send(stripeBody)
      .expect(200);

    // create called only once; second call short-circuits on duplicate check
    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });
});
