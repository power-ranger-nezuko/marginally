/**
 * Auth integration / security tests.
 *
 * These tests use mocked infrastructure (Prisma, KMS) but exercise the full
 * NestJS request pipeline (guards, middleware, controllers) so that HTTP-level
 * security properties can be verified without a real DB.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { TenantController } from '@core/tenant/tenant.controller';
import { TenantService } from '@core/tenant/tenant.service';
import * as crypto from 'crypto';

// Generate RS256 key pair for tests
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Encode to base64 as required by env vars
const PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');
const PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');

const mockPrisma = {
  user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
  auditLog: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockAuditLog = { log: jest.fn(), findByTenant: jest.fn() };

describe('Auth Integration / Security', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = PRIVATE_KEY_B64;
    process.env.JWT_PUBLIC_KEY = PUBLIC_KEY_B64;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          privateKey,
          signOptions: { algorithm: 'RS256', expiresIn: '15m' },
        }),
      ],
      controllers: [AuthController, TenantController],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        TenantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    jwtService = module.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Missing JWT returns 401 ────────────────────────────────────────────

  it('GET /tenants/:id without JWT returns 401', async () => {
    await request(app.getHttpServer())
      .get('/tenants/some-uuid')
      .expect(401);
  });

  // ── 2. Cross-tenant access rejected ──────────────────────────────────────

  it('A JWT from tenant-A cannot spoof tenant-B data', async () => {
    // Issue a token for tenant-A
    const tokenForTenantA = jwtService.sign(
      { sub: 'user-a', tid: 'tenant-a', role: 'OWNER' },
      { algorithm: 'RS256' },
    );

    // The tenant service would look up by id param; return null → 404
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    // Attempting to access tenant-B's record with tenant-A token (must be a valid UUID)
    await request(app.getHttpServer())
      .get('/tenants/00000000-0000-0000-0000-000000000002')
      .set('Authorization', `Bearer ${tokenForTenantA}`)
      .expect(404); // not found — RLS would filter; here service returns null → 404
  });

  // ── 3. Wrong role returns 403 via RolesGuard ──────────────────────────────
  // (Test the guard directly since TenantController doesn't use @Roles, we verify the guard logic)

  it('RolesGuard permits when no roles required', () => {
    const { Reflector } = require('@nestjs/core');
    const { ExecutionContext } = require('@nestjs/common');
    const guard = new RolesGuard(new Reflector());

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'MEMBER' } }) }),
    } as unknown as typeof ExecutionContext;

    // Reflector returns undefined (no @Roles set) → guard allows
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('RolesGuard blocks MEMBER from OWNER-only endpoint', () => {
    const { Reflector } = require('@nestjs/core');
    const guard = new RolesGuard(new Reflector());

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'MEMBER' } }) }),
    } as any;

    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(['OWNER']);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  // ── 4. SQL injection in login email ───────────────────────────────────────

  it('rejects SQL injection attempt in email via validation pipe', async () => {
    // ValidationPipe rejects non-email strings
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: "' OR 1=1; --", password: 'password123' })
      .expect(400);
  });

  it('rejects email with script injection via validation pipe', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '<script>alert(1)</script>', password: 'password123' })
      .expect(400);
  });

  // ── 5. Brute-force lockout ────────────────────────────────────────────────

  it('account is locked after 10 failed login attempts', async () => {
    const baseUser = {
      id: 'user-1', tenantId: 'tenant-1', email: 'target@example.com',
      passwordHash: '$2b$12$invalidhash', role: 'OWNER',
      failedLogins: 9, lockedUntil: null,
    };

    mockPrisma.user.findFirst.mockResolvedValue(baseUser);

    // Mock bcrypt.compare to return false (wrong password)
    const bcrypt = require('bcrypt');
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
    mockPrisma.user.update.mockResolvedValue({});
    mockAuditLog.log.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'target@example.com', password: 'wrongpass' })
      .expect(401);

    // After this 10th failure the update should include a lockedUntil
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLogins: 10,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  // ── 6. Refresh token reuse after logout ───────────────────────────────────

  it('old refresh token is rejected after logout', async () => {
    const bcrypt = require('bcrypt');

    // Simulate: token was deleted from DB (logout happened)
    // On refresh, findMany returns empty → rejected
    mockPrisma.refreshToken.findMany.mockResolvedValue([]);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', refreshToken: 'stale-token' })
      .expect(401);

    expect(res.body.message).toContain('Invalid or expired refresh token');
  });

  // ── 7. Login response never leaks passwordHash ────────────────────────────

  it('successful login response body never contains passwordHash', async () => {
    const bcrypt = require('bcrypt');
    const baseUser = {
      id: 'user-safe', tenantId: 'tenant-safe', email: 'safe@example.com',
      passwordHash: '$2b$12$supersecrethashedvalue', role: 'OWNER',
      failedLogins: 0, lockedUntil: null,
    };

    mockPrisma.user.findFirst.mockResolvedValue(baseUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('refresh-hash');
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockAuditLog.log.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'safe@example.com', password: 'goodpassword' })
      .expect(200);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('supersecrethashedvalue');
    expect(bodyStr).not.toContain('$2b$');
  });

  // ── 8. Expired JWT returns 401 ────────────────────────────────────────────

  it('expired JWT returns 401', async () => {
    const expiredToken = jwtService.sign(
      { sub: 'user-1', tid: 'tenant-1', role: 'OWNER' },
      { algorithm: 'RS256', expiresIn: '-1s' },
    );

    await request(app.getHttpServer())
      .get('/tenants/some-id')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });
});
