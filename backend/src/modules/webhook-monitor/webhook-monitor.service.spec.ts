/**
 * Unit tests for WebhookMonitorService.
 *
 * The service now owns BullMQ queues internally via onModuleInit.
 * We replace the queue instances on the service after construction so
 * no real Redis is needed.
 */

import { WebhookMonitorService } from './webhook-monitor.service';
import { WebhookProvider, WebhookStatus } from '@prisma/client';

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockPrisma = {
  webhookEvent: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  alertRule: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

const mockAuditLog = { log: jest.fn() };

// ── Factory ───────────────────────────────────────────────────────────────────

function buildService() {
  const svc = new WebhookMonitorService(mockPrisma as any, mockAuditLog as any);

  // Stub out BullMQ queues to avoid real Redis connections
  const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }), close: jest.fn() };
  (svc as any).webhookQueue = mockQueue;
  (svc as any).dlqQueue = mockQueue;

  return { svc, mockQueue };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookMonitorService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── isEventDuplicate ──────────────────────────────────────────────────────

  describe('isEventDuplicate', () => {
    it('returns false when event does not exist', async () => {
      const { svc } = buildService();
      mockPrisma.webhookEvent.findUnique.mockResolvedValue(null);

      const result = await svc.isEventDuplicate(WebhookProvider.STRIPE, 'evt_new');
      expect(result).toBe(false);
    });

    it('returns true on second call for same provider+eventId', async () => {
      const { svc } = buildService();
      mockPrisma.webhookEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'db-uuid' });

      const first = await svc.isEventDuplicate(WebhookProvider.STRIPE, 'evt_123');
      const second = await svc.isEventDuplicate(WebhookProvider.STRIPE, 'evt_123');

      expect(first).toBe(false);
      expect(second).toBe(true);
    });
  });

  // ── processEvent ──────────────────────────────────────────────────────────

  describe('processEvent', () => {
    it('updates status to PROCESSING then PROCESSED on success', async () => {
      const { svc } = buildService();

      const fakeEvent = {
        id: 'db-id',
        tenantId: 'tenant-1',
        provider: WebhookProvider.STRIPE,
        eventType: 'invoice.payment_failed',
        status: WebhookStatus.RECEIVED,
      };

      mockPrisma.webhookEvent.findUnique.mockResolvedValue(fakeEvent);
      mockPrisma.webhookEvent.update.mockResolvedValue({ ...fakeEvent });
      mockPrisma.alertRule.findMany.mockResolvedValue([]);

      await svc.processEvent('db-id');

      const calls = mockPrisma.webhookEvent.update.mock.calls;
      expect(calls.some((c: any[]) => c[0].data.status === WebhookStatus.PROCESSING)).toBe(true);
      expect(calls.some((c: any[]) => c[0].data.status === WebhookStatus.PROCESSED)).toBe(true);
    });

    it('re-throws error when processing fails (BullMQ handles retry/FAILED marking)', async () => {
      const { svc } = buildService();

      const fakeEvent = {
        id: 'db-id',
        tenantId: 'tenant-1',
        provider: WebhookProvider.STRIPE,
        eventType: 'invoice.payment_failed',
        status: WebhookStatus.RECEIVED,
      };

      mockPrisma.webhookEvent.findUnique.mockResolvedValue(fakeEvent);
      mockPrisma.webhookEvent.update.mockResolvedValueOnce(fakeEvent); // PROCESSING update
      mockPrisma.alertRule.findMany.mockRejectedValue(new Error('DB error'));

      // processEvent should re-throw so BullMQ can retry the job
      await expect(svc.processEvent('db-id')).rejects.toThrow('DB error');

      // Status is set to PROCESSING before the error but NOT immediately set to FAILED —
      // the BullMQ worker's 'failed' handler sets FAILED only on the last retry attempt.
      const calls = mockPrisma.webhookEvent.update.mock.calls;
      expect(calls.some((c: any[]) => c[0].data.status === WebhookStatus.PROCESSING)).toBe(true);
      expect(calls.some((c: any[]) => c[0].data.status === WebhookStatus.FAILED)).toBe(false);
    });
  });

  // ── checkAndFireAlerts ────────────────────────────────────────────────────

  describe('checkAndFireAlerts', () => {
    it('fires HTTP POST to Slack when eventType matches rule condition', async () => {
      const { svc } = buildService();
      const slackUrl = 'https://hooks.slack.com/services/test';

      mockPrisma.alertRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          name: 'Payment Failed Alert',
          conditionJson: { eventType: 'invoice.payment_failed' },
          notificationChannel: 'slack',
          notificationTarget: slackUrl,
          isActive: true,
        },
      ]);

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      await svc.checkAndFireAlerts('tenant-1', {
        eventType: 'invoice.payment_failed',
        provider: WebhookProvider.STRIPE,
        status: WebhookStatus.PROCESSED,
      });

      expect(fetchSpy).toHaveBeenCalledWith(slackUrl, expect.objectContaining({ method: 'POST' }));
      fetchSpy.mockRestore();
    });

    it('does not fire Slack when eventType does not match condition', async () => {
      const { svc } = buildService();

      mockPrisma.alertRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          name: 'Success Alert',
          conditionJson: { eventType: 'invoice.payment_succeeded' },
          notificationChannel: 'slack',
          notificationTarget: 'https://hooks.slack.com/test',
          isActive: true,
        },
      ]);

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      await svc.checkAndFireAlerts('tenant-1', {
        eventType: 'invoice.payment_failed',
        provider: WebhookProvider.STRIPE,
        status: WebhookStatus.PROCESSED,
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
