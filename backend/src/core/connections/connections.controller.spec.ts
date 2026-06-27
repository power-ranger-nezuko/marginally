import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    oauth: { token: jest.fn() },
  })),
}));

const mockConnectionsService = {
  listConnections: jest.fn(),
  disconnectConnection: jest.fn(),
  createConnection: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mockUser = { sub: 'user-1', tid: 'tenant-1', role: 'OWNER' };

const mockRes = () => {
  const res: any = {};
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

describe('ConnectionsController', () => {
  let controller: ConnectionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [
        { provide: ConnectionsService, useValue: mockConnectionsService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConnectionsController>(ConnectionsController);
    jest.clearAllMocks();

    process.env.STRIPE_CLIENT_ID = 'ca_test_123';
    process.env.APP_URL = 'https://usemarginly.com';
    process.env.WIDGET_SECRET = 'test-widget-secret';
    process.env.STRIPE_PLATFORM_KEY = 'sk_test_platform';
  });

  // ── Existing routes ────────────────────────────────────────────────────────

  it('list delegates to service with tenantId', async () => {
    mockConnectionsService.listConnections.mockResolvedValue([]);
    await controller.list({ user: mockUser } as any);
    expect(mockConnectionsService.listConnections).toHaveBeenCalledWith('tenant-1');
  });

  it('disconnect delegates to service with provider and actor', async () => {
    mockConnectionsService.disconnectConnection.mockResolvedValue(undefined);
    await controller.disconnect('STRIPE', { user: mockUser } as any);
    expect(mockConnectionsService.disconnectConnection).toHaveBeenCalledWith(
      'tenant-1', 'STRIPE', 'user-1',
    );
  });

  // ── stripeOauthInit ────────────────────────────────────────────────────────

  describe('stripeOauthInit', () => {
    it('redirects to Stripe Connect authorize URL with signed state', () => {
      mockJwtService.sign.mockReturnValue('signed-state-token');
      const res = mockRes();

      controller.stripeOauthInit({ user: mockUser } as any, res);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { tid: 'tenant-1', sub: 'user-1', purpose: 'stripe_oauth' },
        expect.objectContaining({ algorithm: 'HS256', expiresIn: '10m' }),
      );

      const redirectUrl: string = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('https://connect.stripe.com/oauth/authorize');
      expect(redirectUrl).toContain('client_id=ca_test_123');
      expect(redirectUrl).toContain('state=signed-state-token');
      expect(redirectUrl).toContain('scope=read_write');
      expect(redirectUrl).toContain(encodeURIComponent('/api/v1/connections/stripe/oauth/callback'));
    });

    it('redirects to error page when STRIPE_CLIENT_ID is not set', () => {
      delete process.env.STRIPE_CLIENT_ID;
      const res = mockRes();

      controller.stripeOauthInit({ user: mockUser } as any, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?error=stripe_not_configured',
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  // ── stripeOauthCallback ────────────────────────────────────────────────────

  describe('stripeOauthCallback', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Stripe } = require('stripe') as { default: jest.Mock };

    beforeEach(() => {
      mockJwtService.verify.mockReturnValue({
        tid: 'tenant-1',
        sub: 'user-1',
        purpose: 'stripe_oauth',
      });
      Stripe.mockImplementation(() => ({
        oauth: {
          token: jest.fn().mockResolvedValue({
            access_token: 'sk_access_token',
            stripe_user_id: 'acct_123',
            scope: 'read_write',
          }),
        },
      }));
      mockConnectionsService.createConnection.mockResolvedValue({});
    });

    it('exchanges code, stores connection, and redirects to settings', async () => {
      const res = mockRes();

      await controller.stripeOauthCallback('auth_code_xyz', 'valid-state', '', res);

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'valid-state',
        expect.objectContaining({ algorithms: ['HS256'] }),
      );
      expect(mockConnectionsService.createConnection).toHaveBeenCalledWith(
        'tenant-1',
        'STRIPE',
        { accessToken: 'sk_access_token', stripeUserId: 'acct_123', scope: 'read_write' },
        ['read_write'],
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?connected=stripe',
      );
    });

    it('redirects to error page when Stripe sends an error param', async () => {
      const res = mockRes();

      await controller.stripeOauthCallback('', '', 'access_denied', res);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?error=access_denied',
      );
      expect(mockConnectionsService.createConnection).not.toHaveBeenCalled();
    });

    it('redirects to error page on invalid state', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });
      const res = mockRes();

      await controller.stripeOauthCallback('code', 'tampered-state', '', res);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?error=oauth_failed',
      );
      expect(mockConnectionsService.createConnection).not.toHaveBeenCalled();
    });

    it('redirects to error page on wrong state purpose', async () => {
      mockJwtService.verify.mockReturnValue({ tid: 'tenant-1', purpose: 'something_else' });
      const res = mockRes();

      await controller.stripeOauthCallback('code', 'state', '', res);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?error=oauth_failed',
      );
    });

    it('redirects to error page when Stripe token exchange fails', async () => {
      (Stripe as jest.Mock).mockImplementation(() => ({
        oauth: { token: jest.fn().mockRejectedValue(new Error('invalid_grant')) },
      }));
      const res = mockRes();

      await controller.stripeOauthCallback('bad_code', 'valid-state', '', res);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://usemarginly.com/settings?error=oauth_failed',
      );
    });
  });
});
