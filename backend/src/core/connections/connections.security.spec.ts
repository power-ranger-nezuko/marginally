/**
 * Security tests for the Stripe Connect OAuth flow.
 *
 * Validates:
 * 1. All authenticated routes reject requests without a JWT
 * 2. State token tampering → graceful error, no connection stored
 * 3. Expired state token → graceful error, no connection stored
 * 4. Wrong purpose in state → graceful error
 * 5. Connection is always scoped to the tenant in the JWT, never a caller-supplied value
 * 6. Stripe error response (user denied) handled gracefully
 * 7. Raw access token is never echoed back in a redirect or response
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as crypto from 'crypto';
import * as jsonwebtoken from 'jsonwebtoken';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { JwtStrategy } from '@core/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const WIDGET_SECRET = 'security-test-widget-secret';
const ATTACKER_SECRET = 'attacker-controlled-secret';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    oauth: {
      token: jest.fn().mockResolvedValue({
        access_token: 'sk_connected_token',
        stripe_user_id: 'acct_victim',
        scope: 'read_write',
      }),
    },
  })),
}));

const mockPrisma = {
  connection: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockKms = {
  encrypt: jest.fn().mockResolvedValue('encrypted'),
  decrypt: jest.fn(),
};

const mockAuditLog = { log: jest.fn().mockResolvedValue({}) };

describe('Connections Security', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
    process.env.JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
    process.env.STRIPE_CLIENT_ID = 'ca_test_security';
    process.env.APP_URL = 'https://usemarginly.com';
    process.env.WIDGET_SECRET = WIDGET_SECRET;
    process.env.STRIPE_PLATFORM_KEY = 'sk_test_platform';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          privateKey,
          signOptions: { algorithm: 'RS256', expiresIn: '15m' },
        }),
      ],
      controllers: [ConnectionsController],
      providers: [
        ConnectionsService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KmsService, useValue: mockKms },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    jwtService = module.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockKms.encrypt.mockResolvedValue('encrypted');
    mockAuditLog.log.mockResolvedValue({});
  });

  const makeToken = (tid = 'tenant-victim', sub = 'user-1') =>
    jwtService.sign({ sub, tid, role: 'OWNER' }, { algorithm: 'RS256' });

  const makeState = (payload: object, secret = WIDGET_SECRET) =>
    jsonwebtoken.sign(payload, secret, { algorithm: 'HS256', expiresIn: '10m' });

  // ── 1. Unauthenticated access ──────────────────────────────────────────────

  it('GET /connections without JWT → 401', async () => {
    await request(app.getHttpServer()).get('/connections').expect(401);
  });

  it('GET /connections/stripe/oauth without JWT → 401', async () => {
    await request(app.getHttpServer()).get('/connections/stripe/oauth').expect(401);
  });

  it('DELETE /connections/STRIPE without JWT → 401', async () => {
    await request(app.getHttpServer()).delete('/connections/STRIPE').expect(401);
  });

  // ── 2. State tampering ────────────────────────────────────────────────────

  it('callback with tampered state redirects to error, no DB write', async () => {
    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: 'tampered.state.value' })
      .expect(302);

    expect(res.headers.location).toContain('error=oauth_failed');
    expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
  });

  it('state signed with a different secret is rejected', async () => {
    const forgottenState = makeState(
      { tid: 'tenant-victim', sub: 'user-1', purpose: 'stripe_oauth' },
      ATTACKER_SECRET, // wrong secret
    );

    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: forgottenState })
      .expect(302);

    expect(res.headers.location).toContain('error=oauth_failed');
    expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
  });

  it('empty state is rejected', async () => {
    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: '' })
      .expect(302);

    expect(res.headers.location).toContain('error=oauth_failed');
  });

  // ── 3. Expired state token ────────────────────────────────────────────────

  it('expired state token is rejected', async () => {
    const expiredState = jsonwebtoken.sign(
      { tid: 'tenant-victim', sub: 'user-1', purpose: 'stripe_oauth' },
      WIDGET_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }, // already expired
    );

    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: expiredState })
      .expect(302);

    expect(res.headers.location).toContain('error=oauth_failed');
    expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
  });

  // ── 4. Wrong purpose in state ─────────────────────────────────────────────

  it('state with wrong purpose is rejected', async () => {
    const wrongPurposeState = makeState({
      tid: 'tenant-victim',
      sub: 'user-1',
      purpose: 'some_other_flow', // not stripe_oauth
    });

    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: wrongPurposeState })
      .expect(302);

    expect(res.headers.location).toContain('error=oauth_failed');
    expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
  });

  // ── 5. Tenant isolation — connection always scoped to state.tid ───────────

  it('connection is stored under the tenant from state, not a query param', async () => {
    const legitimateState = makeState({
      tid: 'tenant-victim',
      sub: 'user-1',
      purpose: 'stripe_oauth',
    });

    mockPrisma.connection.upsert.mockResolvedValue({
      id: 'conn-1', tenantId: 'tenant-victim', provider: 'STRIPE',
      encryptedCredentials: 'enc', scopes: ['read_write'],
      status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
      updatedAt: new Date(), credentialKeyVersion: 1,
    });

    // Attacker appends &tenantId=attacker-tenant to the callback URL — must be ignored
    await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state: legitimateState, tenantId: 'attacker-tenant' })
      .expect(302);

    // Connection must be created for tenant-victim, not attacker-tenant
    expect(mockPrisma.connection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId_provider: expect.objectContaining({ tenantId: 'tenant-victim' }),
        }),
      }),
    );
  });

  // ── 6. Stripe denial handled gracefully ───────────────────────────────────

  it('Stripe error=access_denied redirects to settings without crash', async () => {
    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ error: 'access_denied', error_description: 'User denied access', state: 'x' })
      .expect(302);

    expect(res.headers.location).toContain('error=access_denied');
    expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
  });

  // ── 7. Access token never exposed in redirect ─────────────────────────────

  it('access token from Stripe is never echoed in the redirect URL', async () => {
    const state = makeState({ tid: 'tenant-victim', sub: 'user-1', purpose: 'stripe_oauth' });
    mockPrisma.connection.upsert.mockResolvedValue({
      id: 'conn-1', tenantId: 'tenant-victim', provider: 'STRIPE',
      encryptedCredentials: 'enc', scopes: ['read_write'],
      status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
      updatedAt: new Date(), credentialKeyVersion: 1,
    });

    const res = await request(app.getHttpServer())
      .get('/connections/stripe/oauth/callback')
      .query({ code: 'real_code', state })
      .expect(302);

    expect(res.headers.location).not.toContain('sk_connected_token');
    expect(res.headers.location).not.toContain('acct_victim');
  });
});
