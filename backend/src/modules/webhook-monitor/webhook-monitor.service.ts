import { Injectable, Logger, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { WebhookProvider, WebhookStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { CreateAlertRuleDto } from './dtos/create-alert-rule.dto';
import { GetEventsDto } from './dtos/get-events.dto';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};

@Injectable()
export class WebhookMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookMonitorService.name);

  readonly webhookQueue: Queue;
  readonly dlqQueue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {
    this.webhookQueue = new Queue('webhook-processing', { connection: REDIS_CONNECTION });
    this.dlqQueue = new Queue('webhook-dlq', { connection: REDIS_CONNECTION });
  }

  onModuleInit() {
    this.worker = new Worker(
      'webhook-processing',
      async (job: Job<{ webhookEventId: string }>) => {
        await this.processEvent(job.data.webhookEventId);
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 5,
      },
    );

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
      const maxAttempts = job.opts?.attempts ?? 3;
      const isLastAttempt = (job.attemptsMade ?? 0) >= maxAttempts;

      if (isLastAttempt) {
        // All retries exhausted — mark permanently failed and move to DLQ
        this.logger.error(`Event ${job.data.webhookEventId} exhausted ${maxAttempts} retries: ${err.message}`);
        await this.moveToDlq(job.data.webhookEventId, err.message);
      } else {
        // Still retrying — keep PROCESSING so UI doesn't show false FAILED
        this.logger.warn(
          `Event ${job.data.webhookEventId} failed attempt ${job.attemptsMade}/${maxAttempts}, will retry`,
        );
        await this.prisma.webhookEvent.update({
          where: { id: job.data.webhookEventId },
          data: { status: WebhookStatus.PROCESSING, errorMessage: `Retry ${job.attemptsMade}/${maxAttempts}: ${err.message}` },
        }).catch(() => undefined);
      }
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.webhookQueue.close();
    await this.dlqQueue.close();
  }

  async isEventDuplicate(provider: WebhookProvider, eventId: string): Promise<boolean> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
      select: { id: true },
    });
    return existing !== null;
  }

  async storeEvent(
    provider: WebhookProvider,
    eventId: string,
    eventType: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    return this.prisma.webhookEvent.create({
      data: {
        tenantId,
        provider,
        eventType,
        eventId,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: WebhookStatus.RECEIVED,
      },
    });
  }

  async enqueueEvent(webhookEventDbId: string): Promise<void> {
    await this.webhookQueue.add(
      'process-webhook',
      { webhookEventId: webhookEventDbId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }

  async processEvent(webhookEventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event) {
      throw new NotFoundException(`WebhookEvent ${webhookEventId} not found`);
    }

    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: WebhookStatus.PROCESSING },
    });

    try {
      await this.routeEvent(event);

      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      await this.checkAndFireAlerts(event.tenantId, event);
    } catch (err) {
      // Don't mark FAILED here — the worker's 'failed' handler decides based on retry count.
      // Re-throw so BullMQ knows to retry.
      throw err;
    }
  }

  private async routeEvent(event: {
    provider: WebhookProvider;
    eventType: string;
    tenantId: string;
    payload: unknown;
  }): Promise<void> {
    this.logger.log(
      `Routing event provider=${event.provider} type=${event.eventType} tenant=${event.tenantId}`,
    );
  }

  async replayEvent(tenantId: string, eventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findFirst({
      where: { id: eventId, tenantId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: WebhookStatus.REPLAYED },
    });

    await this.enqueueEvent(eventId);
  }

  async getEvents(tenantId: string, filters: GetEventsDto) {
    const { page, limit, status, eventType } = filters;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async createAlertRule(tenantId: string, dto: CreateAlertRuleDto) {
    return this.prisma.alertRule.create({
      data: {
        tenantId,
        name: dto.name,
        conditionJson: dto.conditionJson as unknown as Prisma.InputJsonValue,
        notificationChannel: dto.notificationChannel,
        notificationTarget: dto.notificationTarget,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listAlertRules(tenantId: string) {
    return this.prisma.alertRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteAlertRule(tenantId: string, ruleId: string): Promise<void> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, tenantId },
    });

    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    await this.prisma.alertRule.delete({ where: { id: ruleId } });
  }

  async checkAndFireAlerts(
    tenantId: string,
    event: { eventType: string; provider: WebhookProvider; status: WebhookStatus },
  ): Promise<void> {
    const rules = await this.prisma.alertRule.findMany({
      where: { tenantId, isActive: true },
    });

    for (const rule of rules) {
      const condition = rule.conditionJson as Record<string, unknown>;
      if (!this.evaluateCondition(condition, event)) continue;

      if (rule.notificationChannel === 'slack') {
        await this.postSlackAlert(rule.notificationTarget, event, rule.name);
      } else {
        this.logger.log(
          `Email alert [${rule.name}] to ${rule.notificationTarget} for event ${event.eventType}`,
        );
      }
    }
  }

  private evaluateCondition(
    condition: Record<string, unknown>,
    event: { eventType: string; provider: WebhookProvider; status: WebhookStatus },
  ): boolean {
    if (condition['eventType'] && condition['eventType'] !== event.eventType) return false;
    if (condition['provider'] && condition['provider'] !== event.provider) return false;
    if (condition['status'] && condition['status'] !== event.status) return false;
    return true;
  }

  private async postSlackAlert(
    webhookUrl: string,
    event: { eventType: string; provider: WebhookProvider },
    ruleName: string,
  ): Promise<void> {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*Webhook Alert: ${ruleName}*\nProvider: ${event.provider}\nEvent: ${event.eventType}`,
        }),
      });

      if (!resp.ok) {
        this.logger.warn(`Slack alert failed: ${resp.status} ${resp.statusText}`);
      }
    } catch (err) {
      this.logger.error('Failed to post Slack alert', err);
    }
  }

  async getStats(tenantId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, processed, failed, processing, providerCounts] = await Promise.all([
      this.prisma.webhookEvent.count({ where: { tenantId, receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.count({ where: { tenantId, status: WebhookStatus.PROCESSED, receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.count({ where: { tenantId, status: WebhookStatus.FAILED, receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.count({ where: { tenantId, status: WebhookStatus.PROCESSING, receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.groupBy({
        by: ['provider'],
        where: { tenantId, receivedAt: { gte: since } },
        _count: true,
      }),
    ]);

    const successRate = total > 0 ? Math.round((processed / total) * 100) : 100;

    return {
      period: '7d',
      total,
      processed,
      failed,
      processing,
      successRate,
      byProvider: providerCounts.map((r) => ({ provider: r.provider, count: r._count })),
    };
  }

  async moveToDlq(webhookEventId: string, error: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event) return;

    await this.dlqQueue.add('dlq-event', { webhookEventId, error });

    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: WebhookStatus.FAILED,
        errorMessage: error,
      },
    });

    await this.auditLog.log({
      tenantId: event.tenantId,
      action: 'webhook.dlq',
      resourceType: 'WebhookEvent',
      resourceId: webhookEventId,
      metadata: { error, provider: event.provider, eventType: event.eventType },
    });
  }
}
