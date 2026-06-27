import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '@core/prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      const params = {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        action: 'LOGIN',
        ipAddress: '127.0.0.1',
      };
      const expected = { id: 'audit-1', ...params };
      mockPrisma.auditLog.create.mockResolvedValue(expected);

      const result = await service.log(params);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          action: 'LOGIN',
          resourceType: undefined,
          resourceId: undefined,
          ipAddress: '127.0.0.1',
          userAgent: undefined,
          metadata: {},
        },
      });
      expect(result).toEqual(expected);
    });

    it('should use empty metadata when not provided', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({});
      await service.log({ tenantId: 't1', action: 'TEST' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metadata: {} }) }),
      );
    });
  });

  describe('findByTenant', () => {
    it('should return recent audit logs with default limit 50', async () => {
      const logs = [{ id: '1' }, { id: '2' }];
      mockPrisma.auditLog.findMany.mockResolvedValue(logs);

      const result = await service.findByTenant('tenant-1');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toEqual(logs);
    });

    it('should respect custom limit', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      await service.findByTenant('tenant-1', 10);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });
});
