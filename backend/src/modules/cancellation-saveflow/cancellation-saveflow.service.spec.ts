import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { CancellationOutcome } from '@prisma/client';
import { CancellationSaveflowService } from './cancellation-saveflow.service';
import { PrismaService } from '@core/prisma/prisma.service';

const WIDGET_SECRET = 'test-widget-secret';

const fakePrisma = {
  saveOffer: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  cancellationAttempt: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
};

describe('CancellationSaveflowService', () => {
  let service: CancellationSaveflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancellationSaveflowService,
        { provide: PrismaService, useValue: fakePrisma },
        {
          provide: ConfigService,
          useValue: { get: (key: string, def: string) => (key === 'WIDGET_SECRET' ? WIDGET_SECRET : def) },
        },
      ],
    }).compile();

    service = module.get(CancellationSaveflowService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validateTenantToken', () => {
    const tenantId = 'tenant-abc';
    const customerId = 'cust-123';

    function makeToken(secret: string) {
      return createHmac('sha256', secret).update(`${tenantId}:${customerId}`).digest('hex');
    }

    it('accepts a correct HMAC token', () => {
      const token = makeToken(WIDGET_SECRET);
      expect(() => service.validateTenantToken(token, tenantId, customerId)).not.toThrow();
    });

    it('rejects a token signed with a wrong secret', () => {
      const badToken = makeToken('wrong-secret');
      expect(() => service.validateTenantToken(badToken, tenantId, customerId)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a tampered token', () => {
      const token = makeToken(WIDGET_SECRET);
      const tampered = token.slice(0, -2) + '00';
      expect(() => service.validateTenantToken(tampered, tenantId, customerId)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token for a different customerId', () => {
      const token = makeToken(WIDGET_SECRET);
      expect(() => service.validateTenantToken(token, tenantId, 'other-cust')).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('recordOutcome', () => {
    it('creates a CancellationAttempt row', async () => {
      const created = {
        id: 'attempt-1',
        tenantId: 'tenant-abc',
        externalCustomerId: 'cust-123',
        saveOfferId: 'offer-1',
        outcome: CancellationOutcome.SAVED,
      };
      (fakePrisma.cancellationAttempt.create as jest.Mock).mockResolvedValue(created);

      const result = await service.recordOutcome(
        'tenant-abc',
        'cust-123',
        'offer-1',
        CancellationOutcome.SAVED,
      );

      expect(fakePrisma.cancellationAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-abc',
          externalCustomerId: 'cust-123',
          saveOfferId: 'offer-1',
          outcome: CancellationOutcome.SAVED,
        }),
      });
      expect(result).toEqual(created);
    });

    it('creates a CancellationAttempt with null saveOfferId when not provided', async () => {
      (fakePrisma.cancellationAttempt.create as jest.Mock).mockResolvedValue({ id: 'a2' });

      await service.recordOutcome('tenant-abc', 'cust-1', undefined, CancellationOutcome.CHURNED);

      expect(fakePrisma.cancellationAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ saveOfferId: null }),
      });
    });
  });
});
