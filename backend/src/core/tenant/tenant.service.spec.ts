import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPrisma = {
  tenant: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  describe('createTenant', () => {
    it('should create tenant with default STARTER plan', async () => {
      const tenant = { id: 't1', name: 'Acme', plan: 'STARTER' };
      mockPrisma.tenant.create.mockResolvedValue(tenant);

      const result = await service.createTenant({ name: 'Acme' });

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
        data: { name: 'Acme', plan: 'STARTER' },
      });
      expect(result).toEqual(tenant);
    });

    it('should create tenant with specified plan', async () => {
      mockPrisma.tenant.create.mockResolvedValue({ id: 't1', name: 'Acme', plan: 'GROWTH' });
      await service.createTenant({ name: 'Acme', plan: 'GROWTH' });
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
        data: { name: 'Acme', plan: 'GROWTH' },
      });
    });
  });

  describe('findById', () => {
    it('should return tenant when found', async () => {
      const tenant = { id: 't1', name: 'Acme' };
      mockPrisma.tenant.findUnique.mockResolvedValue(tenant);
      const result = await service.findById('t1');
      expect(result).toEqual(tenant);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePlan', () => {
    it('should update plan', async () => {
      const tenant = { id: 't1', plan: 'GROWTH' };
      mockPrisma.tenant.findUnique.mockResolvedValue(tenant);
      mockPrisma.tenant.update.mockResolvedValue({ ...tenant, plan: 'SUITE' });

      const result = await service.updatePlan('t1', 'SUITE');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { plan: 'SUITE' },
      });
      expect(result.plan).toBe('SUITE');
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.updatePlan('bad-id', 'GROWTH')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listTenants', () => {
    it('should return all tenants ordered by createdAt desc', async () => {
      const tenants = [{ id: 't1' }, { id: 't2' }];
      mockPrisma.tenant.findMany.mockResolvedValue(tenants);

      const result = await service.listTenants();

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(tenants);
    });
  });
});
