import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { DisputeStatus } from '@prisma/client';
import { DisputeEvidenceController } from './dispute-evidence.controller';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

const mockStripeUpdate = jest.fn().mockResolvedValue({});
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ disputes: { update: mockStripeUpdate } })),
}));

const TENANT_A = 'sec-dispute-a';
const TENANT_B = 'sec-dispute-b';

const DISPUTE_B_DB_ID = 'dispute-db-b';
const DISPUTE_B_STRIPE_ID = 'dp_stripe_b';

const fakePrisma = {
  dispute: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
      if (id === DISPUTE_B_DB_ID) {
        return Promise.resolve({
          id: DISPUTE_B_DB_ID,
          tenantId: TENANT_B,
          stripeDisputeId: DISPUTE_B_STRIPE_ID,
          status: DisputeStatus.OPEN,
        });
      }
      return Promise.resolve(null);
    }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  evidenceBundle: { create: jest.fn() },
};

/**
 * Guard that sets JWT context as Tenant A.
 */
class TenantAGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { tid: TENANT_A, sub: 'user-a', role: 'OWNER' };
    return true;
  }
}

describe('DisputeEvidence Security', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputeEvidenceController],
      providers: [
        DisputeEvidenceService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (_: string, d: string) => d } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TenantAGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  it('Tenant A cannot submit evidence for Tenant B dispute → 403', async () => {
    await request(app.getHttpServer())
      .post(`/disputes/${DISPUTE_B_DB_ID}/evidence`)
      .send({ orderData: {}, shippingData: {}, commsLog: {} })
      .expect(HttpStatus.FORBIDDEN);

    // Stripe should NOT have been called — request blocked before reaching Stripe
    expect(mockStripeUpdate).not.toHaveBeenCalled();
  });

  it('Tenant A cannot GET Tenant B dispute → 404', async () => {
    await request(app.getHttpServer())
      .get(`/disputes/${DISPUTE_B_DB_ID}`)
      .expect(HttpStatus.NOT_FOUND);
  });
});
