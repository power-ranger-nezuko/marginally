import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

const mockTenantService = {
  createTenant: jest.fn(),
  findById: jest.fn(),
  updatePlan: jest.fn(),
  listTenants: jest.fn(),
};

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
});
