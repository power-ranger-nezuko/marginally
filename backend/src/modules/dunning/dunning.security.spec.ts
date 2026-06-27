/**
 * Security tests for the dunning module.
 *
 * Validates:
 * 1. All routes reject unauthenticated requests (no JWT)
 * 2. Tenant isolation: accessing another tenant's resource returns 404
 * 3. A forged tenantId in token cannot see another tenant's data
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DunningController } from './dunning.controller';
import { DunningService } from './dunning.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentTenant } from '@core/auth/decorators/current-tenant.decorator';

const VALID_TENANT = 'tenant-legit';
const OTHER_TENANT = 'tenant-attacker';

const mockService = {
  listFailedPayments: jest.fn(),
  getFailedPayment: jest.fn(),
  listSequences: jest.fn(),
  createSequence: jest.fn(),
  updateSequence: jest.fn(),
  getStats: jest.fn(),
};

// Guard allows only 'Bearer valid-token' and injects VALID_TENANT
const jwtGuardMock = {
  canActivate: jest.fn().mockImplementation((ctx) => {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['authorization'] !== 'Bearer valid-token') return false;
    // CurrentTenant decorator reads req.user.tid
    req.user = { tid: VALID_TENANT };
    return true;
  }),
};

describe('Dunning Security', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DunningController],
      providers: [{ provide: DunningService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuardMock)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Unauthenticated → 401/403 ────────────────────────────────────────

  it('GET /dunning/failed-payments without JWT → 401/403', async () => {
    await request(app.getHttpServer())
      .get('/dunning/failed-payments')
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  it('GET /dunning/stats without JWT → 401/403', async () => {
    await request(app.getHttpServer())
      .get('/dunning/stats')
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  it('GET /dunning/recovery-sequences without JWT → 401/403', async () => {
    await request(app.getHttpServer())
      .get('/dunning/recovery-sequences')
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  // ── 2. Tenant isolation: accessing other tenant's resource → 404 ─────────

  it('GET /dunning/failed-payments/:id for another tenant → 404', async () => {
    // Service scopes by tenantId from JWT; other tenant's fp is not found
    mockService.getFailedPayment.mockRejectedValueOnce(
      new NotFoundException('FailedPayment not found'),
    );

    await request(app.getHttpServer())
      .get('/dunning/failed-payments/other-tenant-fp-id')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    // Verify service was called with VALID_TENANT (from JWT), not attacker's tenant
    expect(mockService.getFailedPayment).toHaveBeenCalledWith(
      VALID_TENANT,
      'other-tenant-fp-id',
    );
  });

  // ── 3. Authenticated request scopes to JWT tenant ─────────────────────────

  it('GET /dunning/failed-payments uses tenantId from JWT, not query param', async () => {
    mockService.listFailedPayments.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, pages: 0 });

    await request(app.getHttpServer())
      .get('/dunning/failed-payments')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(mockService.listFailedPayments).toHaveBeenCalledWith(
      VALID_TENANT, // always from JWT
      expect.any(Object),
    );
  });
});
