import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

const mockConnectionsService = {
  listConnections: jest.fn(),
  disconnectConnection: jest.fn(),
};

const mockUser = { sub: 'user-1', tid: 'tenant-1', role: 'OWNER' };

describe('ConnectionsController', () => {
  let controller: ConnectionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [{ provide: ConnectionsService, useValue: mockConnectionsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConnectionsController>(ConnectionsController);
    jest.clearAllMocks();
  });

  it('list delegates to service with tenantId', async () => {
    mockConnectionsService.listConnections.mockResolvedValue([]);
    const req = { user: mockUser } as any;
    await controller.list(req);
    expect(mockConnectionsService.listConnections).toHaveBeenCalledWith('tenant-1');
  });

  it('disconnect delegates to service', async () => {
    mockConnectionsService.disconnectConnection.mockResolvedValue(undefined);
    const req = { user: mockUser } as any;
    await controller.disconnect('STRIPE', req);
    expect(mockConnectionsService.disconnectConnection).toHaveBeenCalledWith(
      'tenant-1', 'STRIPE', 'user-1',
    );
  });
});
