/**
 * Connections integration tests.
 *
 * Exercises the full NestJS HTTP pipeline (guards, controllers, services)
 * with mocked infrastructure (Prisma, KMS, Stripe SDK).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as crypto from 'crypto';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { JwtStrategy } from '@core/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';

// RSA key pair for token signing in tests
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const WIDGET_SECRET = 'integration-test-widget-secret';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    oauth: {
      token: jest.fn().mockResolvedValue({
        access_token: 'sk_connected_account_token',
        stripe_user_id: 'acct_connected_123',
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
  encrypt: jest.fn().mockResolvedValue('encrypted-creds'),
  decrypt: jest.fn(),
};

const mockAuditLog = { log: jest.fn().mockResolvedValue({}) };

describe('Connections Integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
    process.env.JWT_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
    process.env.STRIPE_CLIENT_ID = 'ca_test_integration';
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
    mockKms.encrypt.mockResolvedValue('encrypted-creds');
    mockAuditLog.log.mockResolvedValue({});
  });

  const makeToken = (tid = 'tenant-1', sub = 'user-1') =>
    jwtService.sign({ sub, tid, role: 'OWNER' }, { algorithm: 'RS256' });

  const makeStateToken = (payload: object, secret = WIDGET_SECRET) => {
    // Use Node's built-in crypto to sign HS256 state, matching the controller
    const jose = require('jsonwebtoken');
    return jose.sign(payload, secret, { algorithm: 'HS256', expiresIn: '10m' });
  };

  // ── GET /connections ───────────────────────────────────────────────────────

  describe('GET /connections', () => {
    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/connections')
        .expect(401);
    });

    it('returns the connection list for the authenticated tenant', async () => {
      mockPrisma.connection.findMany.mockResolvedValue([
        {
          id: 'conn-1', tenantId: 'tenant-1', provider: 'STRIPE',
          encryptedCredentials: 'enc', scopes: ['read_write'],
          status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
          updatedAt: new Date(), credentialKeyVersion: 1,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/connections')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].provider).toBe('STRIPE');
      expect(res.body[0]).not.toHaveProperty('encryptedCredentials');
    });
  });

  // ── DELETE /connections/:provider ─────────────────────────────────────────

  describe('DELETE /connections/:provider', () => {
    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .delete('/connections/STRIPE')
        .expect(401);
    });

    it('disconnects an active connection', async () => {
      mockPrisma.connection.findUnique.mockResolvedValue({
        id: 'conn-1', tenantId: 'tenant-1', provider: 'STRIPE',
      });
      mockPrisma.connection.update.mockResolvedValue({});

      await request(app.getHttpServer())
        .delete('/connections/STRIPE')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(mockPrisma.connection.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DISCONNECTED' } }),
      );
    });
  });

  // ── GET /connections/stripe/oauth ─────────────────────────────────────────

  describe('GET /connections/stripe/oauth', () => {
    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/connections/stripe/oauth')
        .expect(401);
    });

    it('redirects to Stripe Connect authorize URL', async () => {
      const res = await request(app.getHttpServer())
        .get('/connections/stripe/oauth')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(302);

      expect(res.headers.location).toContain('https://connect.stripe.com/oauth/authorize');
      expect(res.headers.location).toContain('client_id=ca_test_integration');
      expect(res.headers.location).toContain('scope=read_write');
      expect(res.headers.location).toContain('state=');
    });

    it('redirect URL contains a callback pointing at our domain', async () => {
      const res = await request(app.getHttpServer())
        .get('/connections/stripe/oauth')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(302);

      expect(res.headers.location).toContain(
        encodeURIComponent('https://usemarginly.com/api/v1/connections/stripe/oauth/callback'),
      );
    });

    it('redirects to error page when STRIPE_CLIENT_ID is missing', async () => {
      const original = process.env.STRIPE_CLIENT_ID;
      delete process.env.STRIPE_CLIENT_ID;

      const res = await request(app.getHttpServer())
        .get('/connections/stripe/oauth')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(302);

      expect(res.headers.location).toContain('error=stripe_not_configured');
      process.env.STRIPE_CLIENT_ID = original;
    });
  });

  // ── GET /connections/stripe/oauth/callback ────────────────────────────────

  describe('GET /connections/stripe/oauth/callback', () => {
    it('exchanges code and redirects to /settings?connected=stripe', async () => {
      const state = makeStateToken({ tid: 'tenant-1', sub: 'user-1', purpose: 'stripe_oauth' });
      mockPrisma.connection.upsert.mockResolvedValue({
        id: 'conn-new', tenantId: 'tenant-1', provider: 'STRIPE',
        encryptedCredentials: 'enc', scopes: ['read_write'],
        status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
        updatedAt: new Date(), credentialKeyVersion: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/connections/stripe/oauth/callback')
        .query({ code: 'auth_code_xyz', state })
        .expect(302);

      expect(res.headers.location).toBe('https://usemarginly.com/settings?connected=stripe');
      expect(mockPrisma.connection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ provider: 'STRIPE', status: 'ACTIVE' }),
        }),
      );
    });

    it('redirects to error page when Stripe sends error param', async () => {
      const res = await request(app.getHttpServer())
        .get('/connections/stripe/oauth/callback')
        .query({ error: 'access_denied', state: 'irrelevant' })
        .expect(302);

      expect(res.headers.location).toContain('error=access_denied');
      expect(mockPrisma.connection.upsert).not.toHaveBeenCalled();
    });

    it('stores credentials encrypted via KMS', async () => {
      const state = makeStateToken({ tid: 'tenant-1', sub: 'user-1', purpose: 'stripe_oauth' });
      mockPrisma.connection.upsert.mockResolvedValue({
        id: 'conn-new', tenantId: 'tenant-1', provider: 'STRIPE',
        encryptedCredentials: 'enc', scopes: ['read_write'],
        status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
        updatedAt: new Date(), credentialKeyVersion: 1,
      });

      await request(app.getHttpServer())
        .get('/connections/stripe/oauth/callback')
        .query({ code: 'auth_code_xyz', state })
        .expect(302);

      expect(mockKms.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          accessToken: 'sk_connected_account_token',
          stripeUserId: 'acct_connected_123',
          scope: 'read_write',
        }),
      );
      expect(mockPrisma.connection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ encryptedCredentials: 'encrypted-creds' }),
        }),
      );
    });
  });
});
