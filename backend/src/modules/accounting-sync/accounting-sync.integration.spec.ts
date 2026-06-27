import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccountingProvider } from '@prisma/client';
import { AccountingSyncService } from './accounting-sync.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { QuickBooksClient } from './quickbooks.client';
import { XeroClient } from './xero.client';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ charges: { list: jest.fn().mockResolvedValue({ data: [] }) } })),
}));

/**
 * Integration test: OAuth token refresh flow
 * Validates that when a token is near-expiry, the service fetches new tokens from QB
 * and stores them re-encrypted.
 */
describe('AccountingSync - OAuth token refresh integration', () => {
  let service: AccountingSyncService;

  const storedConnection = {
    id: 'conn-1',
    tenantId: 'tenant-1',
    provider: AccountingProvider.QUICKBOOKS,
    encryptedAccessToken: 'enc:old-access-token',
    encryptedRefreshToken: 'enc:old-refresh-token',
    tokenExpiresAt: new Date(Date.now() + 60 * 1000), // expires in 1 min (within 5min threshold)
    realmId: 'realm-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const fakePrisma = {
    accountingConnection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
    connection: { findUnique: jest.fn() },
    syncedTransaction: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), upsert: jest.fn() },
  };

  const mockKms = {
    encrypt: jest.fn().mockImplementation((v: string) => Promise.resolve(`enc:${v}`)),
    decrypt: jest.fn().mockImplementation((v: string) => Promise.resolve(v.replace(/^enc:/, ''))),
  };

  const mockQbClient = {
    exchangeCodeForTokens: jest.fn(),
    refreshTokens: jest.fn().mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    createSalesReceipt: jest.fn(),
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
  });

  afterEach(() => jest.clearAllMocks());

  it('exchanges old refresh token for new tokens and re-encrypts them', async () => {
    const newAccessToken = await service.refreshTokenIfNeeded(storedConnection);

    // Decrypt old refresh token to call QB
    expect(mockKms.decrypt).toHaveBeenCalledWith('enc:old-refresh-token');
    expect(mockQbClient.refreshTokens).toHaveBeenCalledWith('old-refresh-token');

    // New tokens should be re-encrypted and stored — never stored in plaintext
    expect(mockKms.encrypt).toHaveBeenCalledWith('new-access-token');
    expect(mockKms.encrypt).toHaveBeenCalledWith('new-refresh-token');

    const updateCall = fakePrisma.accountingConnection.update.mock.calls[0][0];
    // The DB column must hold the KMS-encrypted value, not the raw token string
    expect(updateCall.data.encryptedAccessToken).toBe('enc:new-access-token');
    expect(updateCall.data.encryptedRefreshToken).toBe('enc:new-refresh-token');
    expect(updateCall.data.encryptedAccessToken).not.toBe('new-access-token');
    expect(updateCall.data.encryptedRefreshToken).not.toBe('new-refresh-token');
    // tokenExpiresAt should be updated to reflect the new expiry
    expect(updateCall.data.tokenExpiresAt).toBeInstanceOf(Date);
    // Scoped to the right connection row
    expect(updateCall.where).toEqual({ id: 'conn-1' });

    // Returns plaintext new access token for immediate use (not the encrypted form)
    expect(newAccessToken).toBe('new-access-token');
    expect(newAccessToken).not.toContain('enc:');
  });
});
