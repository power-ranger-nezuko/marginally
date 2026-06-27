import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisputeStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@core/prisma/prisma.service';
import { SubmitEvidenceDto } from './dtos/submit-evidence.dto';
import { ListDisputesDto } from './dtos/list-disputes.dto';

@Injectable()
export class DisputeEvidenceService {
  private readonly logger = new Logger(DisputeEvidenceService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-06-20',
    });
  }

  // ── Webhook handlers ───────────────────────────────────────────────────────

  async handleDisputeCreated(tenantId: string, stripeEvent: Stripe.Event) {
    const dispute = stripeEvent.data.object as Stripe.Dispute;

    return this.prisma.dispute.upsert({
      where: { tenantId_stripeDisputeId: { tenantId, stripeDisputeId: dispute.id } },
      create: {
        tenantId,
        stripeDisputeId: dispute.id,
        status: DisputeStatus.OPEN,
        amount: dispute.amount,
        currency: dispute.currency,
        evidenceDueBy: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000)
          : null,
      },
      update: {},
    });
  }

  async handleDisputeUpdated(tenantId: string, stripeEvent: Stripe.Event) {
    const stripeDispute = stripeEvent.data.object as Stripe.Dispute;

    const existing = await this.prisma.dispute.findUnique({
      where: { tenantId_stripeDisputeId: { tenantId, stripeDisputeId: stripeDispute.id } },
    });
    if (!existing) return null;

    const status = this.mapStripeStatus(stripeDispute.status);

    return this.prisma.dispute.update({
      where: { id: existing.id },
      data: { status },
    });
  }

  private mapStripeStatus(stripeStatus: Stripe.Dispute.Status): DisputeStatus {
    const map: Record<string, DisputeStatus> = {
      needs_response: DisputeStatus.NEEDS_RESPONSE,
      under_review: DisputeStatus.UNDER_REVIEW,
      won: DisputeStatus.WON,
      lost: DisputeStatus.LOST,
      warning_needs_response: DisputeStatus.NEEDS_RESPONSE,
      warning_under_review: DisputeStatus.UNDER_REVIEW,
      warning_closed: DisputeStatus.LOST,
    };
    return map[stripeStatus] ?? DisputeStatus.OPEN;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async listDisputes(tenantId: string, dto: ListDisputesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where = { tenantId, ...(dto.status ? { status: dto.status } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { evidenceBundles: true },
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getDispute(tenantId: string, id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { evidenceBundles: true },
    });
    if (!dispute || dispute.tenantId !== tenantId) {
      throw new NotFoundException('Dispute not found');
    }
    return dispute;
  }

  async getStats(tenantId: string) {
    const [open, won, lost, total] = await Promise.all([
      this.prisma.dispute.count({ where: { tenantId, status: DisputeStatus.OPEN } }),
      this.prisma.dispute.count({ where: { tenantId, status: DisputeStatus.WON } }),
      this.prisma.dispute.count({ where: { tenantId, status: DisputeStatus.LOST } }),
      this.prisma.dispute.count({ where: { tenantId } }),
    ]);

    const decided = won + lost;
    const winRate = decided > 0 ? won / decided : 0;

    return { open, wonCount: won, lostCount: lost, total, winRate };
  }

  // ── Evidence submission ────────────────────────────────────────────────────

  assembleEvidence(
    dispute: { stripeDisputeId: string },
    orderData: Record<string, unknown>,
    shippingData: Record<string, unknown>,
    commsLog: Record<string, unknown>,
  ): Stripe.DisputeUpdateParams['evidence'] {
    return {
      customer_name: (orderData.customerName as string) ?? undefined,
      customer_email_address: (orderData.customerEmail as string) ?? undefined,
      product_description: (orderData.productDescription as string) ?? undefined,
      shipping_carrier: (shippingData.carrier as string) ?? undefined,
      shipping_tracking_number: (shippingData.trackingNumber as string) ?? undefined,
      shipping_date: (shippingData.shippingDate as string) ?? undefined,
      shipping_address: (shippingData.address as string) ?? undefined,
      customer_communication: (commsLog.customerCommunication as string) ?? undefined,
      uncategorized_text: (commsLog.notes as string) ?? undefined,
    };
  }

  async submitEvidence(tenantId: string, disputeId: string, dto: SubmitEvidenceDto) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute || dispute.tenantId !== tenantId) {
      throw new ForbiddenException('Dispute not found or access denied');
    }

    const orderData = dto.orderData ?? {};
    const shippingData = dto.shippingData ?? {};
    const commsLog = dto.commsLog ?? {};

    const stripeEvidence = this.assembleEvidence(dispute, orderData, shippingData, commsLog);

    // Submit to Stripe
    await this.stripe.disputes.update(dispute.stripeDisputeId, {
      evidence: stripeEvidence,
      submit: true,
    });

    // Create evidence bundle
    const bundle = await this.prisma.evidenceBundle.create({
      data: {
        tenantId,
        disputeId: dispute.id,
        orderData: orderData as unknown as Prisma.InputJsonValue,
        shippingData: shippingData as unknown as Prisma.InputJsonValue,
        commsLog: commsLog as unknown as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    });

    // Update dispute status
    await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: DisputeStatus.UNDER_REVIEW },
    });

    return bundle;
  }
}
