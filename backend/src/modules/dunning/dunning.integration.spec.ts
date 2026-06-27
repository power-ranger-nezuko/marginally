/**
 * Integration tests for the dunning recovery flow.
 *
 * Tests the full sequence: FailedPayment creation → Scheduler picks up overdue
 * records → RecoveryAttempt is created.
 *
 * Uses mocked Prisma/SES/Queue so no real infrastructure is needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FailedPaymentStatus, RecoveryChannel, RecoveryResult } from '@prisma/client';
import { DunningService } from './dunning.service';
import { DunningScheduler } from './dunning.scheduler';

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

// ── Shared mocks ──────────────────────────────────────────────────────────────

const TENANT = 'tenant-integration';

const store: Record<string, any> = {};
let idCounter = 0;

const mockPrisma = {
  failedPayment: {
    upsert: jest.fn().mockImplementation(({ create }: any) => {
      const row = { id: `fp-${++idCounter}`, ...create };
      store[`fp:${row.id}`] = row;
      return Promise.resolve(row);
    }),
    findUnique: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(store[`fp:${where.id}`] ?? null);
    }),
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      const rows = Object.values(store).filter(
        (r: any) => r.stripeInvoiceId === where.stripeInvoiceId && r.tenantId === where.tenantId,
      );
      return Promise.resolve(rows[0] ?? null);
    }),
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      const rows = Object.values(store).filter(
        (r: any) =>
          (where.tenantId === undefined || r.tenantId === where.tenantId) &&
          r.status === where.status &&
          r.nextRetryAt !== null &&
          new Date(r.nextRetryAt) <= new Date(where.nextRetryAt?.lte),
      );
      return Promise.resolve(rows);
    }),
    update: jest.fn().mockImplementation(({ where, data }: any) => {
      const key = `fp:${where.id}`;
      if (store[key]) store[key] = { ...store[key], ...data };
      return Promise.resolve(store[key] ?? {});
    }),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  recoverySequence: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'seq-default',
      tenantId: TENANT,
      name: 'Default',
      isDefault: true,
      stepsJson: [
        { delayDays: 0, channel: 'email' }, // immediate for test
        { delayDays: 3, channel: 'email' },
      ],
    }),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  recoveryAttempt: {
    create: jest.fn().mockImplementation(({ data }: any) => {
      const row = { id: `ra-${++idCounter}`, ...data };
      store[`ra:${row.id}`] = row;
      return Promise.resolve(row);
    }),
    count: jest.fn().mockResolvedValue(0),
  },
};

const mockAuditLog = { log: jest.fn() };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dunning Integration: full recovery flow', () => {
  let dunningService: DunningService;
  let dunningScheduler: DunningScheduler;
  let mockQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(store).forEach((k) => delete store[k]);
    idCounter = 0;

    dunningService = new DunningService(mockPrisma as any, mockAuditLog as any);
    // Stub the internal queue so we can inspect queue.add calls
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: `job-${Date.now()}` }),
      close: jest.fn(),
    };
    (dunningService as any).dunningQueue = mockQueue;

    dunningScheduler = new DunningScheduler(mockPrisma as any);
    // Stub the internal queue on the scheduler too
    (dunningScheduler as any).dunningQueue = mockQueue;
  });

  it('full flow: create FailedPayment → scheduler finds it → RecoveryAttempt created', async () => {
    // 1. Stripe fires invoice.payment_failed
    const stripeEvent = {
      data: {
        object: {
          id: 'in_flow_001',
          customer: 'cus_flow_001',
          amount_due: 2999,
          currency: 'usd',
          last_payment_error: { message: 'Insufficient funds' },
        },
      },
    };

    const fp = await dunningService.handleFailedPayment(TENANT, stripeEvent);

    expect(fp).toBeDefined();
    expect(fp.stripeInvoiceId).toBe('in_flow_001');
    expect(fp.status).toBe(FailedPaymentStatus.RECOVERING);

    // 2. scheduleRetries should have enqueued BullMQ jobs
    expect(mockQueue.add).toHaveBeenCalled();
    const recoveryJobs = mockQueue.add.mock.calls.filter((c: any[]) => c[0] === 'send-recovery');
    expect(recoveryJobs).toHaveLength(2); // two steps in mock sequence

    // 3. Simulate scheduler tick: sets nextRetryAt = now for the fp
    store[`fp:${fp.id}`].nextRetryAt = new Date(Date.now() - 1000); // past due

    await dunningScheduler.fireOverdueRetries();

    expect(mockQueue.add).toHaveBeenCalledWith(
      'scheduler-retry',
      { failedPaymentId: fp.id },
      expect.objectContaining({ jobId: expect.stringContaining('scheduler-retry') }),
    );

    // 4. Simulate worker executing sendRecoveryEmail (step 0)
    const sesSendSpy = jest.spyOn(dunningService['ses'] as any, 'send').mockResolvedValue({});

    await dunningService.sendRecoveryEmail(fp.id, 0);

    expect(mockPrisma.recoveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          failedPaymentId: fp.id,
          channel: RecoveryChannel.EMAIL,
          result: RecoveryResult.SENT,
        }),
      }),
    );

    sesSendSpy.mockRestore();
  });

  it('marks FailedPayment as RECOVERED when Stripe fires payment_succeeded', async () => {
    // Setup a pre-existing failed payment in store
    const existing = {
      id: 'fp-pre',
      tenantId: TENANT,
      stripeInvoiceId: 'in_recovered_001',
      status: FailedPaymentStatus.RECOVERING,
    };
    store['fp:fp-pre'] = existing;

    mockPrisma.failedPayment.findFirst.mockResolvedValueOnce(existing);

    await dunningService.handlePaymentSucceeded(TENANT, 'in_recovered_001');

    expect(mockPrisma.failedPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fp-pre' },
        data: { status: FailedPaymentStatus.RECOVERED },
      }),
    );
  });
});
