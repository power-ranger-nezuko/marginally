import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountingProvider, SyncStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { QuickBooksClient } from './quickbooks.client';
import { XeroClient } from './xero.client';
import { SyncStatusQueryDto } from './dtos/sync-status.dto';

type AccountingConnectionRow = {
  id: string;
  tenantId: string;
  provider: AccountingProvider;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiresAt: Date | null;
  realmId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AccountingSyncService {
  private readonly logger = new Logger(AccountingSyncService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kms: KmsService,
    private readonly qbClient: QuickBooksClient,
    private readonly xeroClient: XeroClient,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-06-20',
    });
  }

  // ── Connections ────────────────────────────────────────────────────────────

  async listConnections(tenantId: string) {
    const connections = await this.prisma.accountingConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    // Strip encrypted tokens from response
    return connections.map(({ encryptedAccessToken: _a, encryptedRefreshToken: _r, ...safe }) => safe);
  }

  async disconnectProvider(tenantId: string, provider: AccountingProvider) {
    const connection = await this.prisma.accountingConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!connection) {
      throw new NotFoundException(`No ${provider} connection found`);
    }
    await this.prisma.accountingConnection.delete({
      where: { id: connection.id },
    });
    return { disconnected: true };
  }

  async connectQuickBooks(tenantId: string, authCode: string, realmId: string) {
    const tokens = await this.qbClient.exchangeCodeForTokens(authCode);
    const encryptedAccessToken = await this.kms.encrypt(tokens.access_token);
    const encryptedRefreshToken = await this.kms.encrypt(tokens.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const connection = await this.prisma.accountingConnection.upsert({
      where: { tenantId_provider: { tenantId, provider: AccountingProvider.QUICKBOOKS } },
      create: {
        tenantId,
        provider: AccountingProvider.QUICKBOOKS,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        realmId,
      },
      update: {
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        realmId,
      },
    });

    const { encryptedAccessToken: _a, encryptedRefreshToken: _r, ...safe } = connection;
    return safe;
  }

  async connectXero(tenantId: string, authCode: string) {
    const tokens = await this.xeroClient.exchangeCodeForTokens(authCode);
    const encryptedAccessToken = await this.kms.encrypt(tokens.access_token);
    const encryptedRefreshToken = await this.kms.encrypt(tokens.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const connection = await this.prisma.accountingConnection.upsert({
      where: { tenantId_provider: { tenantId, provider: AccountingProvider.XERO } },
      create: {
        tenantId,
        provider: AccountingProvider.XERO,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
      },
      update: {
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
      },
    });

    const { encryptedAccessToken: _a, encryptedRefreshToken: _r, ...safe } = connection;
    return safe;
  }

  // ── Token refresh ──────────────────────────────────────────────────────────

  async refreshTokenIfNeeded(connection: AccountingConnectionRow): Promise<string> {
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const isExpiringSoon =
      !connection.tokenExpiresAt || connection.tokenExpiresAt <= fiveMinFromNow;

    if (!isExpiringSoon) {
      return this.kms.decrypt(connection.encryptedAccessToken);
    }

    this.logger.log(
      `Refreshing ${connection.provider} token for tenant ${connection.tenantId}`,
    );

    const decryptedRefreshToken = await this.kms.decrypt(connection.encryptedRefreshToken);

    let tokens: { access_token: string; refresh_token: string; expires_in: number };
    if (connection.provider === AccountingProvider.QUICKBOOKS) {
      tokens = await this.qbClient.refreshTokens(decryptedRefreshToken);
    } else {
      tokens = await this.xeroClient.refreshTokens(decryptedRefreshToken);
    }

    const encryptedAccessToken = await this.kms.encrypt(tokens.access_token);
    const encryptedRefreshToken = await this.kms.encrypt(tokens.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.prisma.accountingConnection.update({
      where: { id: connection.id },
      data: { encryptedAccessToken, encryptedRefreshToken, tokenExpiresAt },
    });

    return tokens.access_token;
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  async syncTransactions(tenantId: string): Promise<{ synced: number; failed: number }> {
    const connection = await this.prisma.accountingConnection.findFirst({
      where: { tenantId },
    });

    if (!connection) {
      throw new NotFoundException('No accounting connection found for tenant');
    }

    // Get tenant's Stripe connection to fetch charges
    const stripeConn = await this.prisma.connection.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'STRIPE' } },
    });
    if (!stripeConn) {
      throw new NotFoundException('No Stripe connection found for tenant');
    }

    const { KmsService: _k, ...rest } = { KmsService: null }; // avoid import cycle issue
    const decryptedKey = await this.kms.decrypt(stripeConn.encryptedCredentials);
    const creds = JSON.parse(decryptedKey) as { secretKey: string };
    const tenantStripe = new Stripe(creds.secretKey, { apiVersion: '2024-06-20' });

    // Fetch last 100 charges (last 24h for scheduler runs)
    const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const charges = await tenantStripe.charges.list({
      limit: 100,
      created: { gte: since },
    });

    const accessToken = await this.refreshTokenIfNeeded(connection as AccountingConnectionRow);

    let synced = 0;
    let failed = 0;

    for (const charge of charges.data) {
      if (charge.status !== 'succeeded') continue;

      const existing = await this.prisma.syncedTransaction.findUnique({
        where: { tenantId_stripeTxnId: { tenantId, stripeTxnId: charge.id } },
      });
      if (existing?.syncStatus === SyncStatus.SYNCED) continue;

      try {
        let accountingEntryId: string;

        const entry = {
          amount: charge.amount,
          description: charge.description ?? 'Stripe charge',
          txnId: charge.id,
          currency: charge.currency,
        };

        if (connection.provider === AccountingProvider.QUICKBOOKS) {
          accountingEntryId = await this.qbClient.createSalesReceipt(
            accessToken,
            connection.realmId!,
            entry,
          );
        } else {
          accountingEntryId = await this.xeroClient.createInvoice(accessToken, tenantId, entry);
        }

        await this.prisma.syncedTransaction.upsert({
          where: { tenantId_stripeTxnId: { tenantId, stripeTxnId: charge.id } },
          create: {
            tenantId,
            stripeTxnId: charge.id,
            accountingEntryId,
            syncStatus: SyncStatus.SYNCED,
            syncedAt: new Date(),
          },
          update: {
            accountingEntryId,
            syncStatus: SyncStatus.SYNCED,
            syncedAt: new Date(),
            errorMessage: null,
          },
        });

        synced++;
      } catch (err) {
        this.logger.error(`Failed to sync ${charge.id}: ${(err as Error).message}`);

        await this.prisma.syncedTransaction.upsert({
          where: { tenantId_stripeTxnId: { tenantId, stripeTxnId: charge.id } },
          create: {
            tenantId,
            stripeTxnId: charge.id,
            syncStatus: SyncStatus.FAILED,
            errorMessage: (err as Error).message,
          },
          update: {
            syncStatus: SyncStatus.FAILED,
            errorMessage: (err as Error).message,
          },
        });

        failed++;
      }
    }

    return { synced, failed };
  }

  async getSyncStatus(tenantId: string, dto: SyncStatusQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where = { tenantId, ...(dto.status ? { syncStatus: dto.status } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.syncedTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.syncedTransaction.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getReconciliationReport(tenantId: string) {
    const failed = await this.prisma.syncedTransaction.findMany({
      where: { tenantId, syncStatus: SyncStatus.FAILED },
      orderBy: { createdAt: 'desc' },
    });

    const pending = await this.prisma.syncedTransaction.findMany({
      where: { tenantId, syncStatus: SyncStatus.PENDING },
    });

    return {
      failedCount: failed.length,
      pendingCount: pending.length,
      failed,
      summary: `${failed.length} failed, ${pending.length} pending sync`,
    };
  }
}
