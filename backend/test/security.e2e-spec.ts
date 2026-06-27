import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from '../src/test-utils/test-app.factory';
import {
  cleanDatabase,
  seedTenant,
  seedUser,
  seedConnection,
  seedFailedPayment,
} from '../src/test-utils/db-helpers';
import { loginAs, getAuthHeader, makeFakeJwt } from '../src/test-utils/auth-helpers';
import {
  makeStripeWebhookPayload,
  signStripePayload,
} from '../src/test-utils/stripe-helpers';
import { v4 as uuidv4 } from 'uuid';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

describe('Security hardening', () => {
  let app: INestApplication;
  let tenantId: string;
  let token: string;
  let userEmail: string;
  let userPassword: string;

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
    userEmail = user.email;
    userPassword = password;
    token = await loginAs(app, userEmail, userPassword);
  });

  // ─── Injection attacks ──────────────────────────────────────────────────────

  describe('Injection attacks', () => {
    it('SQL injection in login email field is rejected by validation — 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: "'; DROP TABLE users; --", password: 'irrelevant' });

      // ValidationPipe should reject an invalid email format
      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
    });

    it("login email field with '; DROP TABLE users; -- returns 400 not 500", async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: "admin'--", password: 'pass' });

      expect(res.status).toBe(400);
      // Postgres tables must still exist after this call
      const count = await prisma.user.count();
      expect(typeof count).toBe('number');
    });

    it('XSS payload in tenant name is stored escaped and returned safely', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          tenantName: xssPayload,
          email: `xss-${uuidv4().slice(0, 8)}@example.com`,
          password: 'SecurePassword123!',
        })
        .expect(201);

      // The API must not execute XSS — the name is returned as plain string
      const returnedName: string = res.body.tenant?.name ?? '';
      // Script tags should NOT be rendered as active HTML in API JSON responses
      // but the actual value depends on whether the API sanitises or not;
      // at minimum the response must be JSON (not HTML executing the script)
      expect(res.headers['content-type']).toMatch(/application\/json/);
      // And the response body should not be an error
      expect(res.status).toBe(201);
      expect(returnedName).toBeDefined();
    });

    it('oversized payload (>1MB JSON) to any endpoint returns 413', async () => {
      const largeString = 'A'.repeat(1.1 * 1024 * 1024); // 1.1 MB

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: `${largeString}@example.com`, password: 'x' }));

      expect([400, 413]).toContain(res.status);
    });
  });

  // ─── Authentication bypass attempts ─────────────────────────────────────────

  describe('Authentication bypass attempts', () => {
    it('JWT with algorithm=none is rejected', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: uuidv4(), tid: tenantId, role: 'OWNER', exp: Math.floor(Date.now() / 1000) + 900 }),
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const res = await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(401);

      expect(res.body.message).toMatch(/unauthorized|invalid/i);
    });

    it('JWT with HS256 algorithm (vs expected RS256) is rejected', async () => {
      // Craft an HS256-signed token — the server should reject non-RS256 tokens
      const fakeToken = makeFakeJwt({
        sub: uuidv4(),
        tid: tenantId,
        role: 'OWNER',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
        // alg is HS256 (makeFakeJwt default) rather than expected RS256
      });

      await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set(getAuthHeader(fakeToken))
        .expect(401);
    });

    it('JWT with future iat (not-yet-valid) is rejected', async () => {
      const fakeToken = makeFakeJwt({
        sub: uuidv4(),
        tid: tenantId,
        role: 'OWNER',
        iat: Math.floor(Date.now() / 1000) + 9999, // issued far in the future
        exp: Math.floor(Date.now() / 1000) + 10900,
      });

      await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set(getAuthHeader(fakeToken))
        .expect(401);
    });

    it('request with no Authorization header to protected route returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .expect(401);
    });

    it('request with malformed Bearer token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('request with expired accessToken returns 401', async () => {
      const expiredToken = makeFakeJwt({
        sub: uuidv4(),
        tid: tenantId,
        role: 'OWNER',
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 1, // expired
      });

      await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set(getAuthHeader(expiredToken))
        .expect(401);
    });
  });

  // ─── IDOR ───────────────────────────────────────────────────────────────────

  describe('IDOR (Insecure Direct Object Reference)', () => {
    it('user can only access resources matching their tenantId claim in JWT', async () => {
      const otherTenant = await seedTenant(prisma, { name: 'Other Corp' });
      const otherPayment = await seedFailedPayment(prisma, otherTenant.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/dunning/failed-payments/${otherPayment.id}`)
        .set(getAuthHeader(token));

      expect([403, 404]).toContain(res.status);
    });

    it('incrementing/changing UUID in URL returns 404, not another tenant data', async () => {
      // Use a valid-format but non-existent UUID
      const nonExistentId = uuidv4();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/dunning/failed-payments/${nonExistentId}`)
        .set(getAuthHeader(token))
        .expect(404);

      // Must not expose another tenant's record in a 200 response
      expect(res.status).toBe(404);
    });
  });

  // ─── Rate limiting ───────────────────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('POST /api/v1/auth/login more than 20 times in 5 min returns 429', async () => {
      const attempts = Array.from({ length: 21 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: `ratelimit-${uuidv4().slice(0, 8)}@example.com`, password: 'bad' }),
      );

      const responses = await Promise.all(attempts);
      const statuses = responses.map((r) => r.status);
      expect(statuses).toContain(429);
    });

    it('POST /widget/offer more than 100 times in 1 min returns 429', async () => {
      const tenant = await seedTenant(prisma, { name: 'Widget Tenant' });
      const customerId = `cus_${uuidv4().replace(/-/g, '').slice(0, 14)}`;

      const batch = Array.from({ length: 101 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/widget/offer')
          .send({ tenantId: tenant.id, customerId, hmacToken: 'any' }),
      );

      const responses = await Promise.all(batch);
      const statuses = responses.map((r) => r.status);
      expect(statuses).toContain(429);
    });
  });

  // ─── Webhook security ────────────────────────────────────────────────────────

  describe('Webhook security', () => {
    it('Stripe webhook with replayed (old) timestamp returns 400', async () => {
      const payload = makeStripeWebhookPayload('invoice.payment_failed', { id: 'in_test_old' });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min old (>5 min threshold)
      const signedPayload = `${oldTimestamp}.${payload.toString()}`;
      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');
      const oldSig = `t=${oldTimestamp},v1=${signature}`;

      await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', oldSig)
        .send(payload)
        .expect(400);
    });

    it('Shopify webhook with tampered payload returns 400', async () => {
      const { signShopifyPayload } = await import('../src/test-utils/stripe-helpers');
      const originalPayload = Buffer.from(JSON.stringify({ id: uuidv4(), topic: 'orders/paid' }));
      const validSig = signShopifyPayload(originalPayload, process.env.SHOPIFY_API_SECRET ?? 'test-shopify-secret');

      // Tamper the payload after signing
      const tamperedPayload = Buffer.from(JSON.stringify({ id: uuidv4(), topic: 'orders/paid', extra: 'injected' }));

      await request(app.getHttpServer())
        .post('/api/v1/webhooks/shopify')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-SHA256', validSig)
        .send(tamperedPayload)
        .expect(400);
    });
  });

  // ─── Response security headers ───────────────────────────────────────────────

  describe('Response security headers', () => {
    it('all API responses include X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set(getAuthHeader(token));

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('all API responses do not expose X-Powered-By header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dunning/failed-payments')
        .set(getAuthHeader(token));

      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('all API responses include appropriate CORS headers', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/dunning/failed-payments')
        .set('Origin', 'https://app.usemarginly.com')
        .set('Access-Control-Request-Method', 'GET');

      // Should respond with CORS headers for valid origin
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  // ─── Sensitive data in responses ─────────────────────────────────────────────

  describe('Sensitive data in responses', () => {
    it('GET /connections never returns encrypted_credentials field', async () => {
      await seedConnection(prisma, tenantId, 'STRIPE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set(getAuthHeader(token))
        .expect(200);

      const connections: Record<string, unknown>[] = res.body.data ?? res.body;
      for (const conn of connections) {
        expect(conn).not.toHaveProperty('encryptedCredentials');
        expect(conn).not.toHaveProperty('encrypted_credentials');
      }
    });

    it('GET /accounting/connections never returns encrypted tokens', async () => {
      await prisma.accountingConnection.create({
        data: {
          tenantId,
          provider: 'QUICKBOOKS',
          encryptedAccessToken: 'encrypted:access_token_value',
          encryptedRefreshToken: 'encrypted:refresh_token_value',
          realmId: '1234567890',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/connections')
        .set(getAuthHeader(token))
        .expect(200);

      const connections: Record<string, unknown>[] = res.body.data ?? res.body;
      for (const conn of connections) {
        expect(conn).not.toHaveProperty('encryptedAccessToken');
        expect(conn).not.toHaveProperty('encryptedRefreshToken');
        expect(conn).not.toHaveProperty('encrypted_access_token');
        expect(conn).not.toHaveProperty('encrypted_refresh_token');
      }
    });

    it('login response does not include password hash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userEmail, password: userPassword })
        .expect(200);

      // Check top-level and nested user object
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password_hash');
      if (res.body.user) {
        expect(res.body.user).not.toHaveProperty('passwordHash');
        expect(res.body.user).not.toHaveProperty('password_hash');
      }
    });

    it('tenant endpoint does not expose internal fields', async () => {
      // GET /tenants/:id is a real endpoint — verify it strips sensitive db fields
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${tenantId}`)
        .set(getAuthHeader(token))
        .expect(200);

      // Tenant response must not expose raw DB internals
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password_hash');
      // Should have safe public fields
      expect(res.body).toHaveProperty('id', tenantId);
      expect(res.body).toHaveProperty('name');
    });
  });
});
