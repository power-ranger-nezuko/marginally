import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@core/prisma/prisma.service';
import { AccountingSyncService } from './accounting-sync.service';

@Injectable()
export class AccountingSyncScheduler {
  private readonly logger = new Logger(AccountingSyncScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: AccountingSyncService,
  ) {}

  @Cron('0 2 * * *', { timeZone: 'UTC' })
  async runNightlySync() {
    this.logger.log('Starting nightly accounting sync...');

    // Find all tenants with active accounting connections
    const connections = await this.prisma.accountingConnection.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    let successCount = 0;
    let errorCount = 0;

    for (const { tenantId } of connections) {
      try {
        const result = await this.syncService.syncTransactions(tenantId);
        this.logger.log(
          `Tenant ${tenantId}: synced ${result.synced}, failed ${result.failed}`,
        );
        successCount++;
      } catch (err) {
        this.logger.error(`Nightly sync failed for tenant ${tenantId}: ${(err as Error).message}`);
        errorCount++;
      }
    }

    this.logger.log(
      `Nightly sync complete: ${successCount} tenants succeeded, ${errorCount} errored`,
    );
  }
}
