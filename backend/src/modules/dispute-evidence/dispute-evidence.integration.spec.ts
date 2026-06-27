import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { DisputeStatus } from '@prisma/client';
import { DisputeEvidenceController } from './dispute-evidence.controller';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';

const mockStripeUpdate = jest.fn().mockResolvedValue({ id: 'dp_test' });

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    disputes: { update: mockStripeUpdate },
  })),
}));

const TENANT_ID = 'tenant-dispute-1';
const DISPUTE_ID = 'dispute-db-id-1';

const fakePrisma = {
  dispute: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  evidenceBundle: {
    create: jest.fn().mockResolvedValue({ id: 'bundle-1', submittedAt: new Date() }),
  },
};

class FakeTenantGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { tid: TENANT_ID, sub: 'user-1', role: 'OWNER' };
    return true;
  }
}

describe('DisputeEvidence Integration', () => {
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
      .useClass(FakeTenantGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /disputes/:id/evidence updates dispute status to UNDER_REVIEW', async () => {
    fakePrisma.dispute.findUnique.mockResolvedValue({
      id: DISPUTE_ID,
      tenantId: TENANT_ID,
      stripeDisputeId: 'dp_stripe_1',
      status: DisputeStatus.OPEN,
    });

    await request(app.getHttpServer())
      .post(`/disputes/${DISPUTE_ID}/evidence`)
      .send({
        orderData: { customerName: 'Bob', customerEmail: 'bob@test.com' },
        shippingData: { carrier: 'FedEx', trackingNumber: 'FX123' },
        commsLog: { notes: 'Communicated via email' },
      })
      .expect(HttpStatus.CREATED);

    expect(fakePrisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: DisputeStatus.UNDER_REVIEW },
      }),
    );
    expect(mockStripeUpdate).toHaveBeenCalledWith(
      'dp_stripe_1',
      expect.objectContaining({ submit: true }),
    );
    // Evidence bundle must be persisted in the DB
    expect(fakePrisma.evidenceBundle.create).toHaveBeenCalledTimes(1);
    expect(fakePrisma.evidenceBundle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disputeId: DISPUTE_ID,
        }),
      }),
    );
  });
});
