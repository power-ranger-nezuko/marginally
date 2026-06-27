import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccountingProvider, SyncStatus } from '@prisma/client';
import { AccountingSyncService } from './accounting-sync.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { QuickBooksClient } from './quickbooks.client';
import { XeroClient } from './xero.client';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    charges: {
      list: jest.fn().mockResolvedValue({
        data: [
          { id: 'ch_abc', status: 'succeeded', amount: 5000, currency: 'usd', description: 'Test charge' },
        ],
      }),
    },
  })),
}));

const NOW = Date.now();

const buildConnection = (overrides: Partial<{
  tokenExpiresAt: Date | null;
  provider: AccountingProvider;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
}> = {}) => ({
  id: 'conn-1',
  tenantId: 'tenant-1',
  provider: AccountingProvider.QUICKBOOKS,
  encryptedAccessToken: 'enc-access',
  encryptedRefreshToken: 'enc-refresh',
  tokenExpiresAt: new Date(NOW + 60 * 60 * 1000), // 1h from now
  realmId: 'realm-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AccountingSyncService', () => {
  let service: AccountingSyncService;
  let kms: jest.Mocked<KmsService>;
  let qbClient: jest.Mocked<QuickBooksClient>;

  const fakePrisma = {
    accountingConnection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    connection: {
      findUnique: jest.fn(),
    },
    syncedTransaction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockKms = {
    encrypt: jest.fn().mockImplementation((v: string) => Promise.resolve(`enc:${v}`)),
    decrypt: jest.fn().mockImplementation((v: string) => Promise.resolve(v.replace('enc:', ''))),
  };

  const mockQbClient = {
    exchangeCodeForTokens: jest.fn(),
    refreshTokens: jest.fn(),
    createSalesReceipt: jest.fn().mockResolvedValue('qb-entry-id'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingSyncService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: KmsService, useValue: mockKms },
        { provide: QuickBooksClient, useValue: mockQbClient },
        { provide: XeroClient, useValue: { exchangeCodeForTokens: jest.fn(), refreshTokens: jest.fn(), createInvoice: jest.fn() } },
        { provide: ConfigService, useValue: { get: (_: string, d: string) => d } },
      ],
    }).compile();

    service = module.get(AccountingSyncService);
    kms = module.get(KmsService) as jest.Mocked<KmsService>;
    qbClient = module.get(QuickBooksClient) as jest.Mocked<QuickBooksClient>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('refreshTokenIfNeeded', () => {
    it('does NOT refresh when token expires more than 5 minutes from now', async () => {
      const connection = buildConnection({
        tokenExpiresAt: new Date(NOW + 10 * 60 * 1000), // 10 min from now
      });

      const token = await service.refreshTokenIfNeeded(connection);
      expect(mockQbClient.refreshTokens).not.toHaveBeenCalled();
      expect(token).toBe(connection.encryptedAccessToken.replace('enc:', ''));
    });

    it('refreshes when token expires within 5 minutes', async () => {
      const connection = buildConnection({
        tokenExpiresAt: new Date(NOW + 2 * 60 * 1000), // 2 min from now
        encryptedAccessToken: 'enc:old-access',
        encryptedRefreshToken: 'enc:old-refresh',
      });

      mockKms.decrypt.mockImplementation((v) => Promise.resolve(v.replace('enc:', '')));
      mockQbClient.refreshTokens.mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      });
      fakePrisma.accountingConnection.update.mockResolvedValue({});

      const token = await service.refreshTokenIfNeeded(connection);

      expect(mockQbClient.refreshTokens).toHaveBeenCalledWith('old-refresh');
      expect(token).toBe('new-access');
      expect(fakePrisma.accountingConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: connection.id } }),
      );
    });

    it('refreshes when tokenExpiresAt is null', async () => {
      const connection = buildConnection({ tokenExpiresAt: null });
      mockKms.decrypt.mockResolvedValue('old-refresh');
      mockQbClient.refreshTokens.mockResolvedValue({
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      });
      fakePrisma.accountingConnection.update.mockResolvedValue({});

      const token = await service.refreshTokenIfNeeded(connection);
      expect(token).toBe('fresh-access');
    });
  });

  describe('syncTransactions', () => {
    it('maps Stripe charges to QB sales receipts and saves SyncedTransaction rows', async () => {
      const connection = buildConnection();
      fakePrisma.accountingConnection.findFirst.mockResolvedValue(connection);
      fakePrisma.connection.findUnique.mockResolvedValue({
        encryptedCredentials: JSON.stringify({ secretKey: 'sk_test_xyz' }),
      });
      fakePrisma.syncedTransaction.findUnique.mockResolvedValue(null);
      fakePrisma.syncedTransaction.upsert.mockResolvedValue({});

      // Token is valid (won't refresh)
      mockKms.decrypt
        .mockResolvedValueOnce(JSON.stringify({ secretKey: 'sk_test_xyz' })) // Stripe creds
        .mockResolvedValueOnce('access-token'); // accounting access token

      const result = await service.syncTransactions('tenant-1');

      expect(result.synced).toBeGreaterThanOrEqual(1);
      expect(fakePrisma.syncedTransaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            stripeTxnId: 'ch_abc',
            syncStatus: SyncStatus.SYNCED,
          }),
        }),
      );
    });
  });
});
