import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FailedPaymentStatus } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};

const CRON_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class DunningScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DunningScheduler.name);
  private readonly dunningQueue: Queue;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.dunningQueue = new Queue('dunning-retries', { connection: REDIS_CONNECTION });
  }

  onModuleInit() {
    this.intervalId = setInterval(() => {
      this.fireOverdueRetries().catch((err) => {
        this.logger.error('DunningScheduler error', err);
      });
    }, CRON_INTERVAL_MS);

    this.logger.log('DunningScheduler started (every 5 minutes)');
  }

  async onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    await this.dunningQueue.close();
  }

  async fireOverdueRetries(): Promise<void> {
    const now = new Date();

    const overduePayments = await this.prisma.failedPayment.findMany({
      where: {
        status: FailedPaymentStatus.RECOVERING,
        nextRetryAt: { lte: now },
      },
      select: { id: true, tenantId: true, nextRetryAt: true },
    });

    if (overduePayments.length === 0) return;

    this.logger.log(`DunningScheduler: ${overduePayments.length} overdue failed payments`);

    for (const fp of overduePayments) {
      await this.dunningQueue.add(
        'scheduler-retry',
        { failedPaymentId: fp.id },
        { jobId: `scheduler-retry:${fp.id}:${now.getTime()}` },
      );

      // Clear nextRetryAt to prevent re-pickup before processor reschedules
      await this.prisma.failedPayment.update({
        where: { id: fp.id },
        data: { nextRetryAt: null },
      });
    }
  }
}
