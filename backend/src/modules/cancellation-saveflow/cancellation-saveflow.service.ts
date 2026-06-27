import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { CancellationOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { CreateOfferDto } from './dtos/create-offer.dto';
import { ListAttemptsDto } from './dtos/list-attempts.dto';

@Injectable()
export class CancellationSaveflowService {
  private readonly logger = new Logger(CancellationSaveflowService.name);
  private readonly widgetSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.widgetSecret = config.get<string>('WIDGET_SECRET', 'default-widget-secret');
  }

  // ── Merchant dashboard ────────────────────────────────────────────────────

  async listOffers(tenantId: string) {
    return this.prisma.saveOffer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOffer(tenantId: string, dto: CreateOfferDto) {
    return this.prisma.saveOffer.create({
      data: {
        tenantId,
        type: dto.type,
        configJson: dto.configJson as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateOffer(tenantId: string, id: string, dto: Partial<CreateOfferDto>) {
    const offer = await this.prisma.saveOffer.findUnique({ where: { id } });
    if (!offer || offer.tenantId !== tenantId) {
      throw new NotFoundException('Offer not found');
    }
    return this.prisma.saveOffer.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.configJson !== undefined && { configJson: dto.configJson as unknown as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteOffer(tenantId: string, id: string) {
    const offer = await this.prisma.saveOffer.findUnique({ where: { id } });
    if (!offer || offer.tenantId !== tenantId) {
      throw new NotFoundException('Offer not found');
    }
    await this.prisma.saveOffer.delete({ where: { id } });
    return { deleted: true };
  }

  async getStats(tenantId: string) {
    const attempts = await this.prisma.cancellationAttempt.findMany({
      where: { tenantId },
      include: { saveOffer: true },
    });

    const savedAttempts = attempts.filter((a) => a.outcome === CancellationOutcome.SAVED);
    const churnedAttempts = attempts.filter((a) => a.outcome === CancellationOutcome.CHURNED);

    const savedMrr = savedAttempts.reduce((sum, a) => {
      const config = a.saveOffer?.configJson as Record<string, unknown> | null;
      const discount = config ? Number(config.discountAmount ?? 0) : 0;
      return sum + discount;
    }, 0);

    const total = savedAttempts.length + churnedAttempts.length;
    const saveRate = total > 0 ? savedAttempts.length / total : 0;

    return {
      savedCount: savedAttempts.length,
      churnedCount: churnedAttempts.length,
      savedMrr,
      saveRate,
    };
  }

  async listAttempts(tenantId: string, dto: ListAttemptsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.cancellationAttempt.findMany({
        where: { tenantId },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { saveOffer: true },
      }),
      this.prisma.cancellationAttempt.count({ where: { tenantId } }),
    ]);
    return { items, total, page, limit };
  }

  async getReport(tenantId: string) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [attempts30, attemptsPrev, offerRows, offers] = await Promise.all([
      this.prisma.cancellationAttempt.findMany({
        where: { tenantId, occurredAt: { gte: since30 } },
        include: { saveOffer: true },
      }),
      this.prisma.cancellationAttempt.findMany({
        where: { tenantId, occurredAt: { gte: since60, lt: since30 } },
        include: { saveOffer: true },
      }),
      this.prisma.cancellationAttempt.groupBy({
        by: ['saveOfferId', 'outcome'],
        where: { tenantId, occurredAt: { gte: since30 }, saveOfferId: { not: null } },
        _count: true,
      }),
      this.prisma.saveOffer.findMany({ where: { tenantId } }),
    ]);

    const saved30 = attempts30.filter((a) => a.outcome === CancellationOutcome.SAVED).length;
    const total30 = attempts30.filter((a) => a.outcome !== CancellationOutcome.PENDING).length;
    const savedPrev = attemptsPrev.filter((a) => a.outcome === CancellationOutcome.SAVED).length;
    const totalPrev = attemptsPrev.filter((a) => a.outcome !== CancellationOutcome.PENDING).length;

    const saveRate30 = total30 > 0 ? saved30 / total30 : 0;
    const saveRatePrev = totalPrev > 0 ? savedPrev / totalPrev : 0;
    const saveRateTrend = saveRatePrev > 0
      ? Math.round(((saveRate30 - saveRatePrev) / saveRatePrev) * 100)
      : null;

    // Per-offer acceptance breakdown
    const offerMap = new Map(offers.map((o) => [o.id, o]));
    const perOfferMap = new Map<string, { attempts: number; saved: number }>();

    for (const row of offerRows) {
      if (!row.saveOfferId) continue;
      const entry = perOfferMap.get(row.saveOfferId) ?? { attempts: 0, saved: 0 };
      entry.attempts += row._count;
      if (row.outcome === CancellationOutcome.SAVED) entry.saved += row._count;
      perOfferMap.set(row.saveOfferId, entry);
    }

    const byOffer = Array.from(perOfferMap.entries()).map(([id, stats]) => {
      const offer = offerMap.get(id);
      return {
        offerId: id,
        type: offer?.type ?? 'UNKNOWN',
        attempts: stats.attempts,
        saved: stats.saved,
        acceptanceRate: stats.attempts > 0 ? Math.round((stats.saved / stats.attempts) * 100) : 0,
      };
    });

    return {
      period: 30,
      totalAttempts: total30,
      saved: saved30,
      saveRate: Math.round(saveRate30 * 100),
      saveRateTrend,
      byOffer,
    };
  }

  // ── Widget (public) ───────────────────────────────────────────────────────

  validateTenantToken(token: string, tenantId: string, customerId: string): void {
    const expected = createHmac('sha256', this.widgetSecret)
      .update(`${tenantId}:${customerId}`)
      .digest('hex');

    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);

    // Ensure buffers are the same length before safe comparison
    if (
      tokenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid tenant token');
    }
  }

  async getActiveOffer(tenantId: string) {
    return this.prisma.saveOffer.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async recordOutcome(
    tenantId: string,
    customerId: string,
    saveOfferId: string | undefined,
    outcome: CancellationOutcome,
  ) {
    return this.prisma.cancellationAttempt.create({
      data: {
        tenantId,
        externalCustomerId: customerId,
        saveOfferId: saveOfferId ?? null,
        outcome,
      },
    });
  }
}
