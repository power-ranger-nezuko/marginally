import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

// ── Scenario DTO ──────────────────────────────────────────────────────────────

export interface ScenarioStep {
  step: number;
  action: string;
  result: string;
}

export interface ScenarioDto {
  title: string;
  description: string;
  steps: ScenarioStep[];
}

// ── Scenarios registry ────────────────────────────────────────────────────────

const SCENARIOS: Record<string, ScenarioDto> = {
  'failed-payment': {
    title: 'Failed Payment Recovery',
    description:
      'A subscription payment fails. Marginly detects it via Stripe webhook and schedules a 4-step recovery sequence automatically.',
    steps: [
      {
        step: 1,
        action: 'Stripe fires invoice.payment_failed webhook',
        result: 'FailedPayment row created, recovery sequence scheduled in BullMQ',
      },
      {
        step: 2,
        action: 'Day 1: Recovery email sent',
        result: 'RecoveryAttempt created with channel=EMAIL, Postmark delivers it',
      },
      {
        step: 3,
        action: 'Day 3: Second email if still unpaid',
        result: 'Open rate tracked, status stays RECOVERING',
      },
      {
        step: 4,
        action: 'Stripe retries the charge and succeeds',
        result:
          'invoice.payment_succeeded webhook → status → RECOVERED, $129 saved',
      },
    ],
  },

  cancellation: {
    title: 'Cancellation Save-Flow',
    description:
      "A customer clicks Cancel Subscription. Marginly's embedded widget intercepts and shows a targeted offer.",
    steps: [
      {
        step: 1,
        action:
          "Merchant embeds <script src='https://app.usemarginly.com/widget.js'></script>",
        result: 'Widget JS loads and attaches to cancel button',
      },
      {
        step: 2,
        action: 'Customer clicks Cancel',
        result:
          'Widget intercepts click, calls POST /widget/offer with HMAC-signed token',
      },
      {
        step: 3,
        action: 'Marginly returns active SaveOffer (20% off)',
        result: 'Modal shown to customer with offer',
      },
      {
        step: 4,
        action: 'Customer accepts offer',
        result: 'POST /widget/outcome records SAVED, Stripe coupon applied',
      },
    ],
  },

  dispute: {
    title: 'Dispute Evidence Automation',
    description:
      'A chargeback is filed. Marginly auto-assembles evidence and submits it to Stripe before the deadline.',
    steps: [
      {
        step: 1,
        action: 'Stripe fires charge.dispute.created webhook',
        result: 'Dispute row created, evidence due date set',
      },
      {
        step: 2,
        action:
          'Marginly pulls order data, shipping confirmation, customer emails',
        result: 'EvidenceBundle assembled automatically',
      },
      {
        step: 3,
        action: 'Evidence submitted to Stripe Disputes API',
        result: 'Stripe acknowledges submission, status → UNDER_REVIEW',
      },
      {
        step: 4,
        action: "Stripe rules in merchant's favour",
        result: 'charge.dispute.closed webhook → status → WON',
      },
    ],
  },

  'webhook-failure': {
    title: 'Webhook Failure Detection & Replay',
    description:
      'A Stripe webhook silently fails. Marginly detects it, fires an alert, and lets you replay it in one click.',
    steps: [
      {
        step: 1,
        action: 'Stripe delivers invoice.paid webhook',
        result: 'WebhookEvent stored, BullMQ worker picks it up',
      },
      {
        step: 2,
        action: 'Worker throws exception (e.g. downstream timeout)',
        result: 'Status → FAILED after 3 retries, moved to DLQ',
      },
      {
        step: 3,
        action: 'AlertRule condition met (1 failure)',
        result: 'Slack message sent to ops channel',
      },
      {
        step: 4,
        action: 'Engineer clicks Replay in Marginly dashboard',
        result: 'Event re-queued, status → REPLAYED → PROCESSED',
      },
    ],
  },
};

// ── Demo-mode KMS stub ────────────────────────────────────────────────────────

function demoEncrypt(payload: object): string {
  return 'demo:' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reset ─────────────────────────────────────────────────────────────────

  async resetDemo(): Promise<{
    message: string;
    tenantId: string;
    loginEmail: string;
    loginPassword: string;
  }> {
    const DEMO_PASS = 'DemoPass123!';
    const passwordHash = await bcrypt.hash(DEMO_PASS, 12);

    // Delete existing demo tenants identified by their stripe customer IDs
    const demoStripeIds = ['cus_demo_acme', 'cus_demo_pixel'];
    await this.prisma.tenant.deleteMany({
      where: { stripeCustomerId: { in: demoStripeIds } },
    });

    // Re-create Acme Coffee Roasters
    const acme = await this.prisma.tenant.create({
      data: {
        name: 'Acme Coffee Roasters',
        plan: 'GROWTH',
        billingStatus: 'ACTIVE',
        stripeCustomerId: 'cus_demo_acme',
      },
    });

    await this.prisma.user.create({
      data: {
        tenantId: acme.id,
        email: 'demo@acmecoffee.com',
        passwordHash,
        role: 'OWNER',
      },
    });

    await this.prisma.user.create({
      data: {
        tenantId: acme.id,
        email: 'ops@acmecoffee.com',
        passwordHash,
        role: 'ADMIN',
      },
    });

    // Connections
    await this.prisma.connection.create({
      data: {
        tenantId: acme.id,
        provider: 'STRIPE',
        encryptedCredentials: demoEncrypt({ accessToken: 'sk_test_demo_acme_stripe' }),
        scopes: ['read_write'],
        status: 'ACTIVE',
      },
    });

    await this.prisma.connection.create({
      data: {
        tenantId: acme.id,
        provider: 'SHOPIFY',
        encryptedCredentials: demoEncrypt({
          shopDomain: 'acme-coffee.myshopify.com',
          accessToken: 'shpat_demo_acme',
        }),
        scopes: ['read_orders', 'write_products'],
        status: 'ACTIVE',
      },
    });

    // Recovery sequence
    await this.prisma.recoverySequence.create({
      data: {
        tenantId: acme.id,
        name: 'Standard Recovery',
        isDefault: true,
        stepsJson: [
          { day: 1, channel: 'EMAIL', subject: "We couldn't process your payment", templateId: 'failed-1' },
          { day: 3, channel: 'EMAIL', subject: 'Your subscription is at risk', templateId: 'failed-2' },
          { day: 7, channel: 'SMS', message: 'Last chance to keep your subscription' },
          { day: 14, channel: 'EMAIL', subject: 'Final notice', templateId: 'failed-3' },
        ],
      },
    });

    // Failed payments
    const fp1 = await this.prisma.failedPayment.create({
      data: {
        tenantId: acme.id,
        stripeInvoiceId: 'in_test_demo_001',
        stripeCustomerId: 'cus_demo_acme',
        amount: 4900,
        status: 'RECOVERING',
        retryCount: 1,
        failureReason: 'card_declined',
        nextRetryAt: new Date(Date.now() + 3 * 86400000),
      },
    });

    const fp4 = await this.prisma.failedPayment.create({
      data: {
        tenantId: acme.id,
        stripeInvoiceId: 'in_test_demo_004',
        stripeCustomerId: 'cus_demo_acme',
        amount: 4900,
        status: 'RECOVERED',
        retryCount: 1,
        failureReason: 'card_declined',
      },
    });

    // RecoveryAttempts for recovered payment
    await this.prisma.recoveryAttempt.create({
      data: { tenantId: acme.id, failedPaymentId: fp4.id, channel: 'EMAIL', result: 'SENT' },
    });
    await this.prisma.recoveryAttempt.create({
      data: { tenantId: acme.id, failedPaymentId: fp4.id, channel: 'EMAIL', result: 'PAID' },
    });

    // PENDING failed payment (for simulate)
    await this.prisma.failedPayment.create({
      data: {
        tenantId: acme.id,
        stripeInvoiceId: 'in_test_demo_007',
        stripeCustomerId: 'cus_demo_acme',
        amount: 4900,
        status: 'PENDING',
        retryCount: 0,
        failureReason: 'card_declined',
        nextRetryAt: new Date(Date.now() + 86400000),
      },
    });
    void fp1;

    // SaveOffers
    const discountOffer = await this.prisma.saveOffer.create({
      data: {
        tenantId: acme.id,
        type: 'DISCOUNT',
        configJson: { discountPercent: 20, durationMonths: 3, label: '20% off for 3 months' },
        isActive: true,
      },
    });

    // CancellationAttempts
    const caDefs = [
      { outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 0 },
      { outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 1 },
      { outcome: 'CHURNED' as const, saveOfferId: null, i: 2 },
      { outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 3 },
      { outcome: 'PENDING' as const, saveOfferId: null, i: 4 },
    ];

    for (const ca of caDefs) {
      await this.prisma.cancellationAttempt.create({
        data: {
          tenantId: acme.id,
          externalCustomerId: `cus_demo_cancel_${ca.i.toString().padStart(2, '0')}`,
          saveOfferId: ca.saveOfferId,
          outcome: ca.outcome,
          occurredAt: new Date(Date.now() - ca.i * 2 * 86400000),
        },
      });
    }

    // Dispute
    await this.prisma.dispute.create({
      data: {
        tenantId: acme.id,
        stripeDisputeId: 'in_test_disp_001',
        status: 'OPEN',
        amount: 8900,
        evidenceDueBy: new Date(Date.now() + 3 * 86400000),
      },
    });

    // PENDING SyncedTransaction (for simulate)
    await this.prisma.syncedTransaction.create({
      data: {
        tenantId: acme.id,
        stripeTxnId: 'ch_test_demo_012',
        syncStatus: 'PENDING',
      },
    });

    // Re-create PixelForge Studio
    const pixel = await this.prisma.tenant.create({
      data: {
        name: 'PixelForge Studio',
        plan: 'STARTER',
        billingStatus: 'ACTIVE',
        stripeCustomerId: 'cus_demo_pixel',
      },
    });

    await this.prisma.user.create({
      data: {
        tenantId: pixel.id,
        email: 'demo@pixelforge.com',
        passwordHash,
        role: 'OWNER',
      },
    });

    return {
      message: 'Demo data reset successfully',
      tenantId: acme.id,
      loginEmail: 'demo@acmecoffee.com',
      loginPassword: DEMO_PASS,
    };
  }

  // ── Get Scenario ──────────────────────────────────────────────────────────

  async getScenario(name: string): Promise<ScenarioDto> {
    const scenario = SCENARIOS[name];
    if (!scenario) {
      throw new NotFoundException(
        `Unknown scenario "${name}". Valid options: ${Object.keys(SCENARIOS).join(', ')}`,
      );
    }
    return scenario;
  }

  // ── Simulate ──────────────────────────────────────────────────────────────

  async simulate(scenario: string, tenantId: string): Promise<unknown> {
    switch (scenario) {
      case 'failed-payment':
        return this.simulateFailedPayment(tenantId);

      case 'recovery-email':
        return this.simulateRecoveryEmail(tenantId);

      case 'dispute-won':
        return this.simulateDisputeWon(tenantId);

      case 'accounting-sync':
        return this.simulateAccountingSync(tenantId);

      case 'webhook-failure':
        return this.simulateWebhookFailure(tenantId);

      default:
        throw new NotFoundException(
          `Unknown simulate scenario "${scenario}". Valid options: failed-payment, recovery-email, dispute-won, accounting-sync, webhook-failure`,
        );
    }
  }

  // ── Simulate: failed-payment ──────────────────────────────────────────────

  private async simulateFailedPayment(tenantId: string) {
    const uniqueId = `in_test_sim_${Date.now()}`;
    const newPayment = await this.prisma.failedPayment.create({
      data: {
        tenantId,
        stripeInvoiceId: uniqueId,
        stripeCustomerId: `cus_sim_${Date.now()}`,
        amount: 4900,
        status: 'RECOVERING',
        retryCount: 1,
        failureReason: 'card_declined',
        nextRetryAt: new Date(Date.now() + 86400000),
      },
    });
    return newPayment;
  }

  // ── Simulate: recovery-email ──────────────────────────────────────────────

  private async simulateRecoveryEmail(tenantId: string) {
    const payment = await this.prisma.failedPayment.findFirst({
      where: { tenantId, status: 'RECOVERING' },
      orderBy: { createdAt: 'asc' },
    });

    if (!payment) {
      throw new NotFoundException(
        'No RECOVERING FailedPayment found for this tenant. Run the failed-payment simulation first.',
      );
    }

    const attempt = await this.prisma.recoveryAttempt.create({
      data: {
        tenantId,
        failedPaymentId: payment.id,
        channel: 'EMAIL',
        result: 'SENT',
      },
    });

    return attempt;
  }

  // ── Simulate: dispute-won ─────────────────────────────────────────────────

  private async simulateDisputeWon(tenantId: string) {
    const dispute = await this.prisma.dispute.findFirst({
      where: { tenantId, status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });

    if (!dispute) {
      throw new NotFoundException(
        'No OPEN Dispute found for this tenant.',
      );
    }

    const updated = await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: 'WON' },
    });

    const [wonCount, total] = await Promise.all([
      this.prisma.dispute.count({ where: { tenantId, status: 'WON' } }),
      this.prisma.dispute.count({ where: { tenantId } }),
    ]);

    return {
      dispute: updated,
      stats: {
        wonCount,
        total,
        winRate: total > 0 ? Math.round((wonCount / total) * 100) : 0,
      },
    };
  }

  // ── Simulate: accounting-sync ─────────────────────────────────────────────

  private async simulateAccountingSync(tenantId: string) {
    const txn = await this.prisma.syncedTransaction.findFirst({
      where: { tenantId, syncStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (!txn) {
      throw new NotFoundException(
        'No PENDING SyncedTransaction found for this tenant.',
      );
    }

    const updated = await this.prisma.syncedTransaction.update({
      where: { id: txn.id },
      data: {
        syncStatus: 'SYNCED',
        syncedAt: new Date(),
        accountingEntryId: 'QB-ENTRY-DEMO',
      },
    });

    return updated;
  }

  // ── Simulate: webhook-failure ─────────────────────────────────────────────

  private async simulateWebhookFailure(tenantId: string) {
    const uniqueId = `evt_sim_${Date.now()}`;
    const event = await this.prisma.webhookEvent.create({
      data: {
        tenantId,
        provider: 'STRIPE',
        eventType: 'invoice.paid',
        eventId: uniqueId,
        payload: { demo: true, simulated: true, eventId: uniqueId },
        status: 'FAILED',
        errorMessage: 'Simulated timeout',
        receivedAt: new Date(),
      },
    });
    return event;
  }
}
