import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionsService } from './connections.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { KmsService } from '@core/kms/kms.service';
import { AuditLogService } from '@core/audit-log/audit-log.service';
import { NotFoundException } from '@nestjs/common';

const mockPrisma = {
  connection: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockKms = {
  encrypt: jest.fn(),
  decrypt: jest.fn(),
};

const mockAuditLog = {
  log: jest.fn(),
};

describe('ConnectionsService', () => {
  let service: ConnectionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KmsService, useValue: mockKms },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
    jest.clearAllMocks();
  });

  describe('createConnection', () => {
    it('should encrypt credentials before storing in DB', async () => {
      const creds = { apiKey: 'sk_live_123' };
      mockKms.encrypt.mockResolvedValue('encrypted-creds');
      const connection = {
        id: 'c1',
        tenantId: 'tenant-1',
        provider: 'STRIPE',
        encryptedCredentials: 'encrypted-creds',
        scopes: ['read'],
        status: 'ACTIVE',
        connectedAt: new Date(),
        lastUsedAt: null,
        updatedAt: new Date(),
        credentialKeyVersion: 1,
      };
      mockPrisma.connection.upsert.mockResolvedValue(connection);
      mockAuditLog.log.mockResolvedValue({});

      const result = await service.createConnection('tenant-1', 'STRIPE', creds, ['read']);

      // Verify credentials were encrypted
      expect(mockKms.encrypt).toHaveBeenCalledWith(JSON.stringify(creds));
      // Verify encrypted value was passed to DB
      expect(mockPrisma.connection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ encryptedCredentials: 'encrypted-creds' }),
        }),
      );
      // Verify credentials not returned
      expect(result).not.toHaveProperty('encryptedCredentials');
    });

    it('should log audit on creation', async () => {
      mockKms.encrypt.mockResolvedValue('enc');
      mockPrisma.connection.upsert.mockResolvedValue({
        id: 'c1', tenantId: 't1', provider: 'STRIPE', encryptedCredentials: 'enc',
        scopes: [], status: 'ACTIVE', connectedAt: new Date(), lastUsedAt: null,
        updatedAt: new Date(), credentialKeyVersion: 1,
      });
      mockAuditLog.log.mockResolvedValue({});

      await service.createConnection('t1', 'STRIPE', {}, []);

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONNECTION_CREATED' }),
      );
    });
  });

  describe('getDecryptedCredentials', () => {
    it('should decrypt and return credentials', async () => {
      const creds = { apiKey: 'sk_live_123' };
      mockPrisma.connection.findUnique.mockResolvedValue({
        id: 'c1',
        encryptedCredentials: 'enc',
        status: 'ACTIVE',
      });
      mockKms.decrypt.mockResolvedValue(JSON.stringify(creds));

      const result = await service.getDecryptedCredentials('tenant-1', 'STRIPE');

      expect(result).toEqual(creds);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.connection.findUnique.mockResolvedValue(null);
      await expect(
        service.getDecryptedCredentials('tenant-1', 'STRIPE'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if DISCONNECTED', async () => {
      mockPrisma.connection.findUnique.mockResolvedValue({ status: 'DISCONNECTED' });
      await expect(
        service.getDecryptedCredentials('tenant-1', 'STRIPE'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnectConnection', () => {
    it('should set status to DISCONNECTED and log audit', async () => {
      const connection = { id: 'c1', tenantId: 'tenant-1', provider: 'STRIPE' };
      mockPrisma.connection.findUnique.mockResolvedValue(connection);
      mockPrisma.connection.update.mockResolvedValue({ ...connection, status: 'DISCONNECTED' });
      mockAuditLog.log.mockResolvedValue({});

      await service.disconnectConnection('tenant-1', 'STRIPE', 'user-1');

      expect(mockPrisma.connection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'DISCONNECTED' },
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CONNECTION_DISCONNECTED' }),
      );
    });

    it('should throw if connection not found', async () => {
      mockPrisma.connection.findUnique.mockResolvedValue(null);
      await expect(
        service.disconnectConnection('tenant-1', 'STRIPE'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listConnections', () => {
    it('should return connections without encryptedCredentials', async () => {
      const connections = [
        {
          id: 'c1', tenantId: 't1', provider: 'STRIPE',
          encryptedCredentials: 'secret', scopes: [], status: 'ACTIVE',
          connectedAt: new Date(), lastUsedAt: null, updatedAt: new Date(), credentialKeyVersion: 1,
        },
      ];
      mockPrisma.connection.findMany.mockResolvedValue(connections);

      const result = await service.listConnections('t1');

      expect(result[0]).not.toHaveProperty('encryptedCredentials');
      expect(result[0]).toHaveProperty('provider', 'STRIPE');
    });
  });
});
