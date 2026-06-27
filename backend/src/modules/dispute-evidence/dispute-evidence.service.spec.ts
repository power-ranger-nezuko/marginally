import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisputeStatus } from '@prisma/client';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { PrismaService } from '@core/prisma/prisma.service';

const mockStripeUpdate = jest.fn().mockResolvedValue({ id: 'dp_test', status: 'under_review' });

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    disputes: { update: mockStripeUpdate },
  })),
}));

const fakePrisma = {
  dispute: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  evidenceBundle: {
    create: jest.fn(),
  },
};

describe('DisputeEvidenceService', () => {
  let service: DisputeEvidenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeEvidenceService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (_: string, d: string) => d } },
      ],
    }).compile();

    service = module.get(DisputeEvidenceService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('submitEvidence', () => {
    const TENANT_ID = 'tenant-1';
    const DISPUTE_ID = 'dispute-1';

    it('throws ForbiddenException for wrong tenant', async () => {
      fakePrisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        tenantId: 'other-tenant',
        stripeDisputeId: 'dp_xxx',
      });

      await expect(
        service.submitEvidence(TENANT_ID, DISPUTE_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when dispute not found', async () => {
      fakePrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.submitEvidence(TENANT_ID, DISPUTE_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('calls Stripe disputes.update with assembled evidence and submit=true', async () => {
      const dispute = {
        id: DISPUTE_ID,
        tenantId: TENANT_ID,
        stripeDisputeId: 'dp_abc123',
        status: DisputeStatus.OPEN,
      };
      fakePrisma.dispute.findUnique.mockResolvedValue(dispute);
      fakePrisma.evidenceBundle.create.mockResolvedValue({ id: 'bundle-1' });
      fakePrisma.dispute.update.mockResolvedValue({ ...dispute, status: DisputeStatus.UNDER_REVIEW });

      const dto = {
        orderData: { customerName: 'Alice', customerEmail: 'alice@example.com' },
        shippingData: { carrier: 'UPS', trackingNumber: '1Z999' },
        commsLog: { notes: 'Customer confirmed receipt' },
      };

      await service.submitEvidence(TENANT_ID, DISPUTE_ID, dto);

      expect(mockStripeUpdate).toHaveBeenCalledWith(
        'dp_abc123',
        expect.objectContaining({
          submit: true,
          evidence: expect.objectContaining({
            customer_name: 'Alice',
            customer_email_address: 'alice@example.com',
            shipping_carrier: 'UPS',
            shipping_tracking_number: '1Z999',
          }),
        }),
      );
    });

    it('updates dispute status to UNDER_REVIEW after submission', async () => {
      const dispute = { id: DISPUTE_ID, tenantId: TENANT_ID, stripeDisputeId: 'dp_zzz' };
      fakePrisma.dispute.findUnique.mockResolvedValue(dispute);
      fakePrisma.evidenceBundle.create.mockResolvedValue({ id: 'bundle-2' });
      fakePrisma.dispute.update.mockResolvedValue({});

      await service.submitEvidence(TENANT_ID, DISPUTE_ID, {});

      expect(fakePrisma.dispute.update).toHaveBeenCalledWith({
        where: { id: DISPUTE_ID },
        data: { status: DisputeStatus.UNDER_REVIEW },
      });
    });
  });

  describe('getStats', () => {
    it('returns correct win rate', async () => {
      fakePrisma.dispute.count
        .mockResolvedValueOnce(5)  // open
        .mockResolvedValueOnce(8)  // won
        .mockResolvedValueOnce(2)  // lost
        .mockResolvedValueOnce(15); // total

      const stats = await service.getStats('tenant-1');

      expect(stats.wonCount).toBe(8);
      expect(stats.lostCount).toBe(2);
      // winRate = 8 / (8 + 2) = 0.8
      expect(stats.winRate).toBeCloseTo(0.8);
    });

    it('returns winRate of 0 when no decided disputes', async () => {
      fakePrisma.dispute.count
        .mockResolvedValueOnce(3)  // open
        .mockResolvedValueOnce(0)  // won
        .mockResolvedValueOnce(0)  // lost
        .mockResolvedValueOnce(3); // total

      const stats = await service.getStats('tenant-1');
      expect(stats.winRate).toBe(0);
    });
  });
});
