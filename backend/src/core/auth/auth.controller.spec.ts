import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

const mockAuthService = {
  signup: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
};

const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } } as any;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('signup delegates to AuthService', async () => {
    const dto = { tenantName: 'Acme', email: 'a@b.com', password: 'pass' };
    mockAuthService.signup.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    const result = await controller.signup(dto as any, mockReq);
    expect(mockAuthService.signup).toHaveBeenCalledWith(dto, mockReq.ip, 'test-agent');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });

  it('login delegates to AuthService', async () => {
    const dto = { email: 'a@b.com', password: 'pass' };
    mockAuthService.login.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    await controller.login(dto as any, mockReq);
    expect(mockAuthService.login).toHaveBeenCalledWith(dto, mockReq.ip, 'test-agent');
  });

  it('refresh delegates to AuthService', async () => {
    const dto = { userId: 'u1', refreshToken: 'rt' };
    mockAuthService.refresh.mockResolvedValue({ accessToken: 'at' });
    await controller.refresh(dto);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(dto);
  });

  it('logout delegates to AuthService', async () => {
    const dto = { userId: 'u1', refreshToken: 'rt' };
    mockAuthService.logout.mockResolvedValue(undefined);
    await controller.logout(dto, mockReq);
    expect(mockAuthService.logout).toHaveBeenCalledWith(dto, mockReq.ip, 'test-agent');
  });
});
