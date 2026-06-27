import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as https from 'https';
import { EventEmitter } from 'events';

// Mock bcrypt
jest.mock('bcrypt');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock https for HIBP
jest.mock('https');
const mockHttps = https as jest.Mocked<typeof https>;

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  tenant: {
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('access-token-mock'),
  verify: jest.fn(),
};

const mockAuditLog = {
  log: jest.fn(),
};

function makeHibpMock(responseBody: string) {
  const mockReq = new EventEmitter() as any;
  mockReq.end = jest.fn();

  const mockRes = new EventEmitter() as any;

  mockHttps.get.mockImplementation((_url: any, cb: any) => {
    cb(mockRes);
    // emit data and end synchronously after callback
    setTimeout(() => {
      mockRes.emit('data', responseBody);
      mockRes.emit('end');
    }, 0);
    return mockReq;
  });
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── signup ─────────────────────────────────────────────────────────────────

  describe('signup', () => {
    it('should create tenant and user, return tokens', async () => {
      makeHibpMock('AAAAA:1\nBBBBB:2'); // safe password — no match

      mockBcrypt.hash = jest.fn().mockResolvedValue('hashed-pw') as any;
      mockBcrypt.compare = jest.fn().mockResolvedValue(true) as any;

      const tenant = { id: 'tenant-1', name: 'Acme', plan: 'STARTER', billingStatus: 'TRIALING' };
      const user = { id: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'OWNER' };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(tenant);
      mockPrisma.user.create.mockResolvedValue(user);
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockAuditLog.log.mockResolvedValue({});

      const result = await service.signup({
        tenantName: 'Acme',
        email: 'a@b.com',
        password: 'SecurePass1!',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // Password must be hashed with cost 12 — never stored in plaintext
      expect(mockBcrypt.hash).toHaveBeenCalledWith('SecurePass1!', 12);
      // Audit log written for signup
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SIGNUP' }),
      );
    });

    it('should throw if password is in HIBP breach', async () => {
      // Generate real SHA1 of 'password' to build a matching response
      const crypto = require('crypto');
      const sha1 = crypto.createHash('sha1').update('password').digest('hex').toUpperCase();
      const suffix = sha1.slice(5);
      makeHibpMock(`${suffix}:100\nOTHER:1`);

      await expect(
        service.signup({ tenantName: 'Acme', email: 'a@b.com', password: 'password' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if email exists', async () => {
      makeHibpMock('AAAAA:1'); // safe
      mockBcrypt.hash = jest.fn().mockResolvedValue('hashed-pw') as any;
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.signup({ tenantName: 'Acme', email: 'a@b.com', password: 'SecurePass1!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    const baseUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'a@b.com',
      passwordHash: 'hashed',
      role: 'OWNER',
      failedLogins: 0,
      lockedUntil: null,
    };

    it('should return tokens on valid credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockBcrypt.compare = jest.fn().mockResolvedValue(true) as any;
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockAuditLog.log.mockResolvedValue({});
      mockBcrypt.hash = jest.fn().mockResolvedValue('refresh-hash') as any;

      const result = await service.login({ email: 'a@b.com', password: 'pass' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // Response user object must not expose the password hash
      expect(result).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toContain('hashed');
      // Audit log written for successful login
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN' }),
      );
      // failedLogins reset to 0 on success
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLogins: 0 }),
        }),
      );
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password and increment failedLogins', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser });
      mockBcrypt.compare = jest.fn().mockResolvedValue(false) as any;
      mockPrisma.user.update.mockResolvedValue({});
      mockAuditLog.log.mockResolvedValue({});

      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLogins: 1 }),
        }),
      );
    });

    it('should lock account after 10 failed logins', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser, failedLogins: 9 });
      mockBcrypt.compare = jest.fn().mockResolvedValue(false) as any;
      mockPrisma.user.update.mockResolvedValue({});
      mockAuditLog.log.mockResolvedValue({});

      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.failedLogins).toBe(10);
      expect(updateCall.data.lockedUntil).toBeInstanceOf(Date);
    });

    it('should throw UnauthorizedException if account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findFirst.mockResolvedValue({
        ...baseUser,
        lockedUntil: futureDate,
      });

      await expect(service.login({ email: 'a@b.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should return new access token for valid refresh token', async () => {
      const user = { id: 'user-1', tenantId: 'tenant-1', role: 'OWNER' };
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash: 'hash', expiresAt: new Date(Date.now() + 1000000), user },
      ]);
      mockBcrypt.compare = jest.fn().mockResolvedValue(true) as any;

      const result = await service.refresh({ userId: 'user-1', refreshToken: 'raw-token' });

      expect(result).toHaveProperty('accessToken');
    });

    it('should throw if no matching token found', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash: 'hash', expiresAt: new Date(Date.now() + 1000000), user: {} },
      ]);
      mockBcrypt.compare = jest.fn().mockResolvedValue(false) as any;

      await expect(
        service.refresh({ userId: 'user-1', refreshToken: 'wrong-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should delete refresh token and log audit', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash: 'hash', tenantId: 'tenant-1', user: {} },
      ]);
      mockBcrypt.compare = jest.fn().mockResolvedValue(true) as any;
      mockPrisma.refreshToken.delete.mockResolvedValue({});
      mockAuditLog.log.mockResolvedValue({});

      await service.logout({ userId: 'user-1', refreshToken: 'raw-token' });

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
      });
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGOUT' }),
      );
    });

    it('should throw if token not found', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);
      await expect(
        service.logout({ userId: 'user-1', refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
