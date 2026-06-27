import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import type { TenantContext } from '@core/auth/decorators/current-tenant.decorator';

const mockTenantService = {
  createTenant: jest.fn(),
  findById: jest.fn(),
  updatePlan: jest.fn(),
  listTenants: jest.fn(),
};

const tenant: TenantContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER' };

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [{ provide: TenantService, useValue: mockTenantService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TenantController>(TenantController);
    jest.clearAllMocks();
  });

  it('create delegates to service', async () => {
    const dto = { name: 'Acme' };
    mockTenantService.createTenant.mockResolvedValue({ id: 't1' });
    await controller.create(dto);
    expect(mockTenantService.createTenant).toHaveBeenCalledWith(dto);
  });

  it('findOne delegates to service', async () => {
    mockTenantService.findById.mockResolvedValue({ id: 't1' });
    await controller.findOne('t1');
    expect(mockTenantService.findById).toHaveBeenCalledWith('t1');
  });

  it('updatePlan delegates to service', async () => {
    mockTenantService.updatePlan.mockResolvedValue({ id: 't1', plan: 'GROWTH' });
    await controller.updatePlan('t1', { plan: 'GROWTH' });
    expect(mockTenantService.updatePlan).toHaveBeenCalledWith('t1', 'GROWTH');
  });

  // ── GET /tenants/me ─────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('delegates to service with tenantId from context', async () => {
      mockTenantService.findById.mockResolvedValue({ id: 'tenant-1', plan: 'GROWTH' });
      await controller.getMe(tenant);
      expect(mockTenantService.findById).toHaveBeenCalledWith('tenant-1');
    });

    it('returns the tenant object from service', async () => {
      const expected = { id: 'tenant-1', name: 'Acme', plan: 'GROWTH' };
      mockTenantService.findById.mockResolvedValue(expected);
      const result = await controller.getMe(tenant);
      expect(result).toEqual(expected);
    });
  });

  // ── PATCH /tenants/me/plan ───────────────────────────────────────────────────

  describe('updateMyPlan', () => {
    it('delegates to service with tenantId and plan', async () => {
      mockTenantService.updatePlan.mockResolvedValue({ id: 'tenant-1', plan: 'SUITE' });
      await controller.updateMyPlan(tenant, { plan: 'SUITE' });
      expect(mockTenantService.updatePlan).toHaveBeenCalledWith('tenant-1', 'SUITE');
    });

    it('returns the updated tenant', async () => {
      const expected = { id: 'tenant-1', plan: 'SUITE' };
      mockTenantService.updatePlan.mockResolvedValue(expected);
      const result = await controller.updateMyPlan(tenant, { plan: 'SUITE' });
      expect(result).toEqual(expected);
    });

    it('uses tenant from context, never a caller-supplied id', async () => {
      mockTenantService.updatePlan.mockResolvedValue({ id: 'tenant-1', plan: 'STARTER' });
      await controller.updateMyPlan(tenant, { plan: 'STARTER' });
      // Must use tenant-1 from context, not any other value
      expect(mockTenantService.updatePlan).toHaveBeenCalledWith('tenant-1', expect.anything());
    });
  });
});
