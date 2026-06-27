import { Injectable, Logger, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { FailedPaymentStatus, RecoveryChannel, RecoveryResult, Prisma } from '@prisma/client';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { CreateRecoverySequenceDto, RecoveryStepDto } from './dtos/create-recovery-sequence.dto';
import { ListFailedPaymentsDto } from './dtos/list-failed-payments.dto';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};

interface StripeInvoicePaymentFailedEvent {
  data: {
    object: {
      id: string;
      customer: string;
      amount_due: number;
      currency: string;
      last_payment_error?: { message?: string };
    };
  };
}

@Injectable()
export class DunningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DunningService.name);
  private readonly ses: SESClient;
  private readonly sns: SNSClient;
  readonly dunningQueue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    this.ses = new SESClient({ region });
    this.sns = new SNSClient({ region });
    this.dunningQueue = new Queue('dunning-retries', { connection: REDIS_CONNECTION });
  }

  onModuleInit() {
    this.worker = new Worker(
      'dunning-retries',
      async (job: Job<{ failedPaymentId: string; stepIndex: number; channel: string }>) => {
        const { failedPaymentId, stepIndex, channel } = job.data;
        if (channel === 'email' || channel === 'EMAIL') {
          await this.sendRecoveryEmail(failedPaymentId, stepIndex);
        } else {
          await this.sendRecoverySms(failedPaymentId);
        }
      },
      { connection: REDIS_CONNECTION, concurrency: 3 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Dunning job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('DunningService initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.dunningQueue.close();
  }

  // ─── Failed payment lifecycle ─────────────────────────────────────────────

  async handleFailedPayment(
    tenantId: string,
    stripeEvent: StripeInvoicePaymentFailedEvent,
  ) {
    const invoice = stripeEvent.data.object;

    const failedPayment = await this.prisma.failedPayment.upsert({
      where: {
        tenantId_stripeInvoiceId: {
          tenantId,
          stripeInvoiceId: invoice.id,
        },
      },
      create: {
        tenantId,
        stripeInvoiceId: invoice.id,
        stripeCustomerId: invoice.customer,
        amount: invoice.amount_due,
        currency: invoice.currency,
        failureReason: invoice.last_payment_error?.message,
        status: FailedPaymentStatus.RECOVERING,
        retryCount: 0,
      },
      update: {
        retryCount: { increment: 1 },
        failureReason: invoice.last_payment_error?.message,
        status: FailedPaymentStatus.RECOVERING,
      },
    });

    await this.scheduleRetries(failedPayment.id);

    await this.auditLog.log({
      tenantId,
      action: 'dunning.failed_payment.created',
      resourceType: 'FailedPayment',
      resourceId: failedPayment.id,
      metadata: { stripeInvoiceId: invoice.id, amount: invoice.amount_due },
    });

    return failedPayment;
  }

  async handlePaymentSucceeded(tenantId: string, stripeInvoiceId: string): Promise<void> {
    const fp = await this.prisma.failedPayment.findFirst({
      where: { tenantId, stripeInvoiceId },
    });

    if (!fp) return;

    await this.prisma.failedPayment.update({
      where: { id: fp.id },
      data: { status: FailedPaymentStatus.RECOVERED },
    });

    await this.auditLog.log({
      tenantId,
      action: 'dunning.payment_recovered',
      resourceType: 'FailedPayment',
      resourceId: fp.id,
      metadata: { stripeInvoiceId },
    });
  }

  async scheduleRetries(failedPaymentId: string): Promise<void> {
    const fp = await this.prisma.failedPayment.findUnique({
      where: { id: failedPaymentId },
    });

    if (!fp) throw new NotFoundException('FailedPayment not found');

    const sequence = await this.prisma.recoverySequence.findFirst({
      where: { tenantId: fp.tenantId, isDefault: true },
    });

    if (!sequence) {
      this.logger.warn(`No default RecoverySequence for tenant ${fp.tenantId}`);
      return;
    }

    const steps = sequence.stepsJson as unknown as RecoveryStepDto[];

    for (const [index, step] of steps.entries()) {
      const delayMs = step.delayDays * 24 * 60 * 60 * 1000;

      await this.dunningQueue.add(
        'send-recovery',
        { failedPaymentId, stepIndex: index, channel: step.channel },
        { delay: delayMs, jobId: `recovery:${failedPaymentId}:step:${index}` },
      );

      if (index === 0) {
        await this.prisma.failedPayment.update({
          where: { id: failedPaymentId },
          data: { nextRetryAt: new Date(Date.now() + delayMs) },
        });
      }
    }
  }

  // ─── Recovery comms ───────────────────────────────────────────────────────

  async sendRecoveryEmail(failedPaymentId: string, stepIndex: number): Promise<void> {
    const fp = await this.prisma.failedPayment.findUnique({
      where: { id: failedPaymentId },
    });

    if (!fp) throw new NotFoundException('FailedPayment not found');

    // Look up sequence step for custom subject/body
    const sequence = await this.prisma.recoverySequence.findFirst({
      where: { tenantId: fp.tenantId, isDefault: true },
    });
    const steps = (sequence?.stepsJson ?? []) as unknown as RecoveryStepDto[];
    const step = steps[stepIndex];

    const { subject, body } = this.buildEmailContent(fp, stepIndex, step);

    await this.sendViaSes(fp.stripeCustomerId, subject, body);

    await this.prisma.recoveryAttempt.create({
      data: {
        tenantId: fp.tenantId,
        failedPaymentId: fp.id,
        channel: RecoveryChannel.EMAIL,
        result: RecoveryResult.SENT,
      },
    });

    this.logger.log(`Recovery email sent for failedPayment ${failedPaymentId} step ${stepIndex}`);
  }

  async sendRecoverySms(failedPaymentId: string): Promise<void> {
    const fp = await this.prisma.failedPayment.findUnique({
      where: { id: failedPaymentId },
    });

    if (!fp) throw new NotFoundException('FailedPayment not found');

    const message = `Payment of ${fp.amount / 100} ${fp.currency.toUpperCase()} failed. Please update your payment method.`;

    await this.sns.send(
      new PublishCommand({
        PhoneNumber: fp.stripeCustomerId,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
        },
      }),
    );

    await this.prisma.recoveryAttempt.create({
      data: {
        tenantId: fp.tenantId,
        failedPaymentId: fp.id,
        channel: RecoveryChannel.SMS,
        result: RecoveryResult.SENT,
      },
    });
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async listFailedPayments(tenantId: string, filters: ListFailedPaymentsDto) {
    const { page, limit, status } = filters;
    const skip = (page - 1) * limit;
    const where = { tenantId, ...(status ? { status } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.failedPayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { recoveryAttempts: { orderBy: { sentAt: 'desc' }, take: 5 } },
      }),
      this.prisma.failedPayment.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getFailedPayment(tenantId: string, id: string) {
    const fp = await this.prisma.failedPayment.findFirst({
      where: { id, tenantId },
      include: { recoveryAttempts: true },
    });

    if (!fp) throw new NotFoundException('FailedPayment not found');
    return fp;
  }

  async getStats(tenantId: string) {
    const [totalRecovered, totalWrittenOff, activeRecovering, allAttempts, successAttempts] =
      await Promise.all([
        this.prisma.failedPayment.aggregate({
          where: { tenantId, status: FailedPaymentStatus.RECOVERED },
          _sum: { amount: true },
        }),
        this.prisma.failedPayment.aggregate({
          where: { tenantId, status: FailedPaymentStatus.WRITTEN_OFF },
          _sum: { amount: true },
        }),
        this.prisma.failedPayment.count({
          where: { tenantId, status: FailedPaymentStatus.RECOVERING },
        }),
        this.prisma.recoveryAttempt.count({ where: { tenantId } }),
        this.prisma.recoveryAttempt.count({
          where: { tenantId, result: RecoveryResult.PAID },
        }),
      ]);

    const successRate = allAttempts > 0 ? (successAttempts / allAttempts) * 100 : 0;

    return {
      totalRecovered: totalRecovered._sum.amount ?? 0,
      totalWrittenOff: totalWrittenOff._sum.amount ?? 0,
      activeRecovering,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  async getReport(tenantId: string, days = 30) {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [currentPeriod, prevPeriod, failureReasons, dailyRows] = await Promise.all([
      this.prisma.failedPayment.aggregate({
        where: { tenantId, status: FailedPaymentStatus.RECOVERED, updatedAt: { gte: periodStart } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.failedPayment.aggregate({
        where: {
          tenantId,
          status: FailedPaymentStatus.RECOVERED,
          updatedAt: { gte: prevPeriodStart, lt: periodStart },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.failedPayment.groupBy({
        by: ['failureReason'],
        where: { tenantId, createdAt: { gte: periodStart }, failureReason: { not: null } },
        _count: true,
        orderBy: { _count: { failureReason: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<{ date: string; amount: number; count: number }[]>`
        SELECT
          DATE("updatedAt")::text AS date,
          COALESCE(SUM(amount), 0)::int AS amount,
          COUNT(*)::int AS count
        FROM failed_payments
        WHERE "tenantId" = ${tenantId}
          AND status = 'RECOVERED'
          AND "updatedAt" >= ${periodStart}
        GROUP BY DATE("updatedAt")
        ORDER BY date ASC
      `,
    ]);

    const recovered = currentPeriod._sum.amount ?? 0;
    const recoveredPrev = prevPeriod._sum.amount ?? 0;
    const trend = recoveredPrev > 0 ? Math.round(((recovered - recoveredPrev) / recoveredPrev) * 100) : null;

    return {
      period: days,
      recovered,
      recoveredCount: currentPeriod._count,
      trend,
      dailyRecoveries: dailyRows,
      topFailureReasons: failureReasons.map((r) => ({
        reason: r.failureReason ?? 'Unknown',
        count: r._count,
      })),
    };
  }

  // ─── Recovery sequences ───────────────────────────────────────────────────

  async createSequence(tenantId: string, dto: CreateRecoverySequenceDto) {
    if (dto.isDefault) {
      await this.prisma.recoverySequence.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.recoverySequence.create({
      data: {
        tenantId,
        name: dto.name,
        stepsJson: dto.steps as unknown as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async listSequences(tenantId: string) {
    return this.prisma.recoverySequence.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSequence(tenantId: string, id: string, dto: Partial<CreateRecoverySequenceDto>) {
    const existing = await this.prisma.recoverySequence.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('RecoverySequence not found');

    if (dto.isDefault) {
      await this.prisma.recoverySequence.updateMany({
        where: { tenantId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.recoverySequence.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.steps ? { stepsJson: dto.steps as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildEmailContent(
    fp: { stripeInvoiceId: string; amount: number; currency: string },
    stepIndex: number,
    step?: RecoveryStepDto,
  ): { subject: string; body: string } {
    const amount = `${(fp.amount / 100).toFixed(2)} ${fp.currency.toUpperCase()}`;

    // Use custom step template if provided
    if (step?.subject && step?.message) {
      return {
        subject: step.subject,
        body: step.message
          .replace('{{amount}}', amount)
          .replace('{{invoice}}', fp.stripeInvoiceId),
      };
    }

    // Built-in escalating templates
    const templates = [
      {
        subject: 'Payment failed — please update your payment method',
        body: [
          `Hi,`,
          ``,
          `We were unable to process your payment of ${amount} (Invoice: ${fp.stripeInvoiceId}).`,
          ``,
          `Please update your payment method at your earliest convenience to avoid any service interruption.`,
          ``,
          `Thank you,`,
          `The Marginly Team`,
        ].join('\n'),
      },
      {
        subject: `Action required: Payment of ${amount} still outstanding`,
        body: [
          `Hi,`,
          ``,
          `This is a follow-up regarding your overdue payment of ${amount} (Invoice: ${fp.stripeInvoiceId}).`,
          ``,
          `Your account may be suspended if payment is not received within the next 48 hours.`,
          `Please update your payment method now to keep your service active.`,
          ``,
          `Thank you,`,
          `The Marginly Team`,
        ].join('\n'),
      },
      {
        subject: `Final notice: Account suspension for unpaid invoice ${fp.stripeInvoiceId}`,
        body: [
          `Hi,`,
          ``,
          `This is our final notice regarding the unpaid amount of ${amount} (Invoice: ${fp.stripeInvoiceId}).`,
          ``,
          `Your account will be suspended within 24 hours unless payment is received.`,
          `Please update your payment method immediately to avoid losing access.`,
          ``,
          `If you have already updated your payment method, please disregard this message.`,
          ``,
          `Thank you,`,
          `The Marginly Team`,
        ].join('\n'),
      },
    ];

    const template = templates[Math.min(stepIndex, templates.length - 1)];
    return template;
  }

  private async sendViaSes(to: string, subject: string, body: string): Promise<void> {
    const fromEmail = process.env.SES_FROM_EMAIL ?? 'noreply@marginly.app';

    await this.ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      }),
    );
  }

}
