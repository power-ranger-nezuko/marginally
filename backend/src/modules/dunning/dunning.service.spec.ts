import { NotFoundException } from '@nestjs/common';
import { DunningService } from './dunning.service';
import { FailedPaymentStatus, RecoveryChannel, RecoveryResult } from '@prisma/client';

// ── Mock bullmq so no real Redis connections are made ────────────────────────

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockPrisma = {
  failedPayment: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
  },
  recoverySequence: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  recoveryAttempt: {
    create: jest.fn(),
    count: jest.fn(),
  },
};

const mockAuditLog = { log: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService() {
  const svc = new DunningService(mockPrisma as any, mockAuditLog as any);
  // Stub the queue created in constructor so tests can inspect it
  (svc as any).dunningQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn(),
  };
  return svc;
}

const TENANT = 'tenant-abc';

const stripeFailedEvent = {
  data: {
    object: {
      id: 'in_test_001',
      customer: 'cus_test_001',
      amount_due: 4999,
      currency: 'usd',
      last_payment_error: { message: 'Card declined' },
    },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DunningService', () => {
  let service: DunningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ── handleFailedPayment ──────────────────────────────────────────────────

  describe('handleFailedPayment', () => {
    it('creates a FailedPayment DB row and schedules retries', async () => {
      const createdFp = {
        id: 'fp-001',
        tenantId: TENANT,
        stripeInvoiceId: 'in_test_001',
        stripeCustomerId: 'cus_test_001',
        amount: 4999,
        currency: 'usd',
        status: FailedPaymentStatus.RECOVERING,
        retryCount: 0,
      };

      mockPrisma.failedPayment.upsert.mockResolvedValue(createdFp);
      mockPrisma.failedPayment.findUnique.mockResolvedValue(createdFp);
      mockPrisma.recoverySequence.findFirst.mockResolvedValue({
        id: 'seq-1',
        tenantId: TENANT,
        name: 'Default',
        isDefault: true,
        stepsJson: [
          { delayDays: 1, channel: 'email' },
          { delayDays: 3, channel: 'email' },
        ],
      });
      mockPrisma.failedPayment.update.mockResolvedValue(createdFp);

      const result = await service.handleFailedPayment(TENANT, stripeFailedEvent);

      expect(mockPrisma.failedPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_stripeInvoiceId: { tenantId: TENANT, stripeInvoiceId: 'in_test_001' } },
          create: expect.objectContaining({
            amount: 4999,
            status: FailedPaymentStatus.RECOVERING,
          }),
        }),
      );

      expect(result.id).toBe('fp-001');
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'dunning.failed_payment.created' }),
      );
    });
  });

  // ── scheduleRetries ──────────────────────────────────────────────────────

  describe('scheduleRetries', () => {
    it('enqueues correct BullMQ jobs for each step in default sequence', async () => {
      const fp = {
        id: 'fp-002',
        tenantId: TENANT,
        stripeInvoiceId: 'in_002',
        stripeCustomerId: 'cus_002',
        amount: 1000,
        currency: 'usd',
        status: FailedPaymentStatus.RECOVERING,
      };

      const steps = [
        { delayDays: 1, channel: 'email' },
        { delayDays: 3, channel: 'sms' },
        { delayDays: 7, channel: 'email' },
      ];

      mockPrisma.failedPayment.findUnique.mockResolvedValue(fp);
      mockPrisma.recoverySequence.findFirst.mockResolvedValue({
        id: 'seq-default',
        tenantId: TENANT,
        isDefault: true,
        stepsJson: steps,
      });
      mockPrisma.failedPayment.update.mockResolvedValue(fp);

      const mockQueue = (service as any).dunningQueue;
      await service.scheduleRetries('fp-002');

      expect(mockQueue.add).toHaveBeenCalledTimes(steps.length);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-recovery',
        { failedPaymentId: 'fp-002', stepIndex: 0, channel: 'email' },
        expect.objectContaining({ delay: 1 * 24 * 60 * 60 * 1000, jobId: 'recovery:fp-002:step:0' }),
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-recovery',
        { failedPaymentId: 'fp-002', stepIndex: 1, channel: 'sms' },
        expect.objectContaining({ delay: 3 * 24 * 60 * 60 * 1000, jobId: 'recovery:fp-002:step:1' }),
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-recovery',
        { failedPaymentId: 'fp-002', stepIndex: 2, channel: 'email' },
        expect.objectContaining({ delay: 7 * 24 * 60 * 60 * 1000, jobId: 'recovery:fp-002:step:2' }),
      );

      // nextRetryAt is set to step 0 delay
      expect(mockPrisma.failedPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nextRetryAt: expect.any(Date) }),
        }),
      );
    });

    it('does nothing when no default sequence exists', async () => {
      mockPrisma.failedPayment.findUnique.mockResolvedValue({
        id: 'fp-003',
        tenantId: TENANT,
      });
      mockPrisma.recoverySequence.findFirst.mockResolvedValue(null);

      const mockQueue = (service as any).dunningQueue;
      await service.scheduleRetries('fp-003');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns correct aggregated stats', async () => {
      mockPrisma.failedPayment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 50000 } }) // recovered
        .mockResolvedValueOnce({ _sum: { amount: 10000 } }); // written off

      mockPrisma.failedPayment.count.mockResolvedValue(5); // activeRecovering
      mockPrisma.recoveryAttempt.count
        .mockResolvedValueOnce(20) // allAttempts
        .mockResolvedValueOnce(4);  // successAttempts (PAID)

      const stats = await service.getStats(TENANT);

      expect(stats).toEqual({
        totalRecovered: 50000,
        totalWrittenOff: 10000,
        activeRecovering: 5,
        successRate: 20, // (4/20)*100
      });
    });

    it('returns 0 successRate when no attempts exist', async () => {
      mockPrisma.failedPayment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      mockPrisma.failedPayment.count.mockResolvedValue(0);
      mockPrisma.recoveryAttempt.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const stats = await service.getStats(TENANT);

      expect(stats.successRate).toBe(0);
      expect(stats.totalRecovered).toBe(0);
    });
  });

  // ── handlePaymentSucceeded ────────────────────────────────────────────────

  describe('handlePaymentSucceeded', () => {
    it('marks FailedPayment as RECOVERED', async () => {
      const fp = { id: 'fp-recovered', tenantId: TENANT, stripeInvoiceId: 'in_pay_001' };
      mockPrisma.failedPayment.findFirst.mockResolvedValue(fp);
      mockPrisma.failedPayment.update.mockResolvedValue({ ...fp, status: FailedPaymentStatus.RECOVERED });

      await service.handlePaymentSucceeded(TENANT, 'in_pay_001');

      expect(mockPrisma.failedPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fp-recovered' },
          data: { status: FailedPaymentStatus.RECOVERED },
        }),
      );
    });

    it('is a no-op when invoice was never a failed payment', async () => {
      mockPrisma.failedPayment.findFirst.mockResolvedValue(null);

      await service.handlePaymentSucceeded(TENANT, 'in_never_failed');

      expect(mockPrisma.failedPayment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT,
            stripeInvoiceId: 'in_never_failed',
          }),
        }),
      );
      expect(mockPrisma.failedPayment.update).not.toHaveBeenCalled();
    });
  });
});
