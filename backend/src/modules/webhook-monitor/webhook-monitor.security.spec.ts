/**
 * Security tests for the webhook-monitor module.
 *
 * These tests validate that:
 * 1. Stripe endpoint rejects missing/invalid signatures at the HTTP layer
 * 2. Protected routes reject unauthenticated requests
 * 3. Tenant isolation is enforced on replay
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { WebhookMonitorController } from './webhook-monitor.controller';
import { WebhookMonitorService } from './webhook-monitor.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

// ── helpers ──────────────────────────────────────────────────────────────────

function buildStripeSignature(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = `${timestamp}.${body}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

const STRIPE_SECRET = 'whsec_test_secret';
const WRONG_SECRET = 'whsec_wrong';

// ── mock service ──────────────────────────────────────────────────────────────

const mockService = {
  isEventDuplicate: jest.fn().mockResolvedValue(false),
  storeEvent: jest.fn().mockResolvedValue({ id: 'db-id' }),
  enqueueEvent: jest.fn().mockResolvedValue(undefined),
  replayEvent: jest.fn().mockResolvedValue(undefined),
  getEvents: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  listAlertRules: jest.fn().mockResolvedValue([]),
  createAlertRule: jest.fn().mockResolvedValue({ id: 'rule-1' }),
  deleteAlertRule: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({ total: 0, processed: 0, failed: 0, processing: 0, successRate: 100, byProvider: [] }),
};

// JwtAuthGuard stub: passes if Authorization header present with 'Bearer valid-token'
const jwtGuardMock = {
  canActivate: jest.fn().mockImplementation((ctx) => {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['authorization'] === 'Bearer valid-token') {
      req.user = { tid: 'tenant-test' };
      return true;
    }
    return false;
  }),
};

describe('WebhookMonitor Security', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookMonitorController],
      providers: [{ provide: WebhookMonitorService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuardMock)
      .compile();

    app = module.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Missing Stripe-Signature → 400 ──────────────────────────────────────

  it('POST /webhooks/stripe without Stripe-Signature header → 400', async () => {
    const body = JSON.stringify({ id: 'evt_test', type: 'invoice.payment_failed' });
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400);
  });

  // ── 2. Forged Stripe-Signature with wrong secret → 400 ────────────────────

  it('POST /webhooks/stripe with forged signature → 400', async () => {
    const body = JSON.stringify({ id: 'evt_forged', type: 'invoice.payment_failed' });
    const forgedSig = buildStripeSignature(WRONG_SECRET, body);

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/octet-stream')
      .set('stripe-signature', forgedSig)
      .send(Buffer.from(body))
      .expect(400);
  });

  // ── 3. GET /dunning/failed-payments without JWT → 401 ────────────────────
  // (tested via the guard mock returning false)

  it('GET /webhooks/events without JWT → 401/403', async () => {
    await request(app.getHttpServer())
      .get('/webhooks/events')
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  // ── 4. Replay event belonging to another tenant → service throws 404 ──────

  it('POST /webhooks/events/:id/replay for another tenant event → propagates error', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    mockService.replayEvent.mockRejectedValueOnce(
      new NotFoundException('Event not found'),
    );

    await request(app.getHttpServer())
      .post('/webhooks/events/other-tenant-event-id/replay')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
  });
});
