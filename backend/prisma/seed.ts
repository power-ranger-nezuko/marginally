/**
 * Marginly — Demo Seed Script
 *
 * Run:  npx ts-node prisma/seed.ts
 *
 * Fully idempotent — all writes use upsert keyed on unique fields.
 * Safe to re-run at any time without creating duplicates.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ── Demo-mode KMS stub ────────────────────────────────────────────────────────
// Real KMS service checks for the "demo:" prefix in dev/test mode and skips
// actual decryption. In production, this prefix is never written.
function demoEncrypt(payload: object): string {
  return 'demo:' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱  Seeding demo data …');

  // Hash once and reuse — bcrypt cost 12 is expensive, no need to repeat it.
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  // ── Tenant A: Acme Coffee Roasters ─────────────────────────────────────────
  const acme = await prisma.tenant.upsert({
    where: { stripeCustomerId: 'cus_demo_acme' },
    update: { name: 'Acme Coffee Roasters', plan: 'GROWTH', billingStatus: 'ACTIVE' },
    create: {
      name: 'Acme Coffee Roasters',
      plan: 'GROWTH',
      billingStatus: 'ACTIVE',
      stripeCustomerId: 'cus_demo_acme',
    },
  });

  const acmeOwner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: acme.id, email: 'demo@acmecoffee.com' } },
    update: { passwordHash, role: 'OWNER' },
    create: {
      tenantId: acme.id,
      email: 'demo@acmecoffee.com',
      passwordHash,
      role: 'OWNER',
    },
  });
  void acmeOwner; // used for reference / future audit seeding

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: acme.id, email: 'ops@acmecoffee.com' } },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      tenantId: acme.id,
      email: 'ops@acmecoffee.com',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // Connections
  await prisma.connection.upsert({
    where: { tenantId_provider: { tenantId: acme.id, provider: 'STRIPE' } },
    update: {},
    create: {
      tenantId: acme.id,
      provider: 'STRIPE',
      encryptedCredentials: demoEncrypt({ accessToken: 'sk_test_demo_acme_stripe' }),
      scopes: ['read_write'],
      status: 'ACTIVE',
    },
  });

  await prisma.connection.upsert({
    where: { tenantId_provider: { tenantId: acme.id, provider: 'SHOPIFY' } },
    update: {},
    create: {
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

  // ── Module 1: Dunning ───────────────────────────────────────────────────────

  const recoverySequence = await prisma.recoverySequence.upsert({
    where: { id: 'seed-seq-acme-standard' },
    update: {},
    create: {
      id: 'seed-seq-acme-standard',
      tenantId: acme.id,
      name: 'Standard Recovery',
      isDefault: true,
      stepsJson: [
        {
          day: 1,
          channel: 'EMAIL',
          subject: "We couldn't process your payment",
          templateId: 'failed-1',
        },
        {
          day: 3,
          channel: 'EMAIL',
          subject: 'Your subscription is at risk',
          templateId: 'failed-2',
        },
        { day: 7, channel: 'SMS', message: 'Last chance to keep your subscription' },
        { day: 14, channel: 'EMAIL', subject: 'Final notice', templateId: 'failed-3' },
      ],
    },
  });
  void recoverySequence;

  // Failed payments: 8 rows
  const failedPaymentDefs = [
    // in_test_demo_001 → RECOVERING, retryCount 1, amount 4900
    {
      id: 'seed-fp-001',
      stripeInvoiceId: 'in_test_demo_001',
      amount: 4900,
      status: 'RECOVERING' as const,
      retryCount: 1,
      nextRetryAt: new Date(Date.now() + 3 * 86400000),
    },
    // in_test_demo_002 → RECOVERING, retryCount 2, amount 12900
    {
      id: 'seed-fp-002',
      stripeInvoiceId: 'in_test_demo_002',
      amount: 12900,
      status: 'RECOVERING' as const,
      retryCount: 2,
      nextRetryAt: new Date(Date.now() + 5 * 86400000),
    },
    // in_test_demo_003 → RECOVERING, retryCount 3, amount 29900
    {
      id: 'seed-fp-003',
      stripeInvoiceId: 'in_test_demo_003',
      amount: 29900,
      status: 'RECOVERING' as const,
      retryCount: 3,
      nextRetryAt: new Date(Date.now() + 7 * 86400000),
    },
    // in_test_demo_004 → RECOVERED, amount 4900
    {
      id: 'seed-fp-004',
      stripeInvoiceId: 'in_test_demo_004',
      amount: 4900,
      status: 'RECOVERED' as const,
      retryCount: 1,
      nextRetryAt: null,
    },
    // in_test_demo_005 → RECOVERED, amount 4900
    {
      id: 'seed-fp-005',
      stripeInvoiceId: 'in_test_demo_005',
      amount: 4900,
      status: 'RECOVERED' as const,
      retryCount: 2,
      nextRetryAt: null,
    },
    // in_test_demo_006 → WRITTEN_OFF, amount 12900
    {
      id: 'seed-fp-006',
      stripeInvoiceId: 'in_test_demo_006',
      amount: 12900,
      status: 'WRITTEN_OFF' as const,
      retryCount: 4,
      nextRetryAt: null,
    },
    // in_test_demo_007 → PENDING, amount 4900
    {
      id: 'seed-fp-007',
      stripeInvoiceId: 'in_test_demo_007',
      amount: 4900,
      status: 'PENDING' as const,
      retryCount: 0,
      nextRetryAt: new Date(Date.now() + 86400000),
    },
    // in_test_demo_008 → RECOVERING, retryCount 3, amount 29900
    {
      id: 'seed-fp-008',
      stripeInvoiceId: 'in_test_demo_008',
      amount: 29900,
      status: 'RECOVERING' as const,
      retryCount: 3,
      nextRetryAt: new Date(Date.now() + 2 * 86400000),
    },
  ];

  for (const fp of failedPaymentDefs) {
    await prisma.failedPayment.upsert({
      where: { tenantId_stripeInvoiceId: { tenantId: acme.id, stripeInvoiceId: fp.stripeInvoiceId } },
      update: {},
      create: {
        id: fp.id,
        tenantId: acme.id,
        stripeInvoiceId: fp.stripeInvoiceId,
        stripeCustomerId: 'cus_demo_acme',
        amount: fp.amount,
        status: fp.status,
        retryCount: fp.retryCount,
        nextRetryAt: fp.nextRetryAt,
        failureReason: 'card_declined',
      },
    });
  }

  // RecoveryAttempts for the 2 RECOVERED payments (2 attempts each)
  const recoveryAttemptDefs = [
    // fp-004: EMAIL SENT then EMAIL PAID
    { id: 'seed-ra-001', failedPaymentId: 'seed-fp-004', channel: 'EMAIL' as const, result: 'SENT' as const },
    { id: 'seed-ra-002', failedPaymentId: 'seed-fp-004', channel: 'EMAIL' as const, result: 'PAID' as const },
    // fp-005: EMAIL SENT then EMAIL PAID
    { id: 'seed-ra-003', failedPaymentId: 'seed-fp-005', channel: 'EMAIL' as const, result: 'SENT' as const },
    { id: 'seed-ra-004', failedPaymentId: 'seed-fp-005', channel: 'EMAIL' as const, result: 'PAID' as const },
  ];

  for (const ra of recoveryAttemptDefs) {
    const existing = await prisma.recoveryAttempt.findUnique({ where: { id: ra.id } });
    if (!existing) {
      await prisma.recoveryAttempt.create({
        data: {
          id: ra.id,
          tenantId: acme.id,
          failedPaymentId: ra.failedPaymentId,
          channel: ra.channel,
          result: ra.result,
        },
      });
    }
  }

  // ── Module 2: Cancellation Save-Flow ───────────────────────────────────────

  const discountOffer = await prisma.saveOffer.upsert({
    where: { id: 'seed-offer-discount' },
    update: {},
    create: {
      id: 'seed-offer-discount',
      tenantId: acme.id,
      type: 'DISCOUNT',
      configJson: { discountPercent: 20, durationMonths: 3, label: '20% off for 3 months' },
      isActive: true,
    },
  });

  await prisma.saveOffer.upsert({
    where: { id: 'seed-offer-pause' },
    update: {},
    create: {
      id: 'seed-offer-pause',
      tenantId: acme.id,
      type: 'PAUSE',
      configJson: { pauseMonths: 1, label: 'Pause for 1 month' },
      isActive: true,
    },
  });

  await prisma.saveOffer.upsert({
    where: { id: 'seed-offer-downgrade' },
    update: {},
    create: {
      id: 'seed-offer-downgrade',
      tenantId: acme.id,
      type: 'DOWNGRADE',
      configJson: { targetPlan: 'starter', targetPrice: 1900, label: 'Switch to Starter' },
      isActive: true,
    },
  });

  // 15 CancellationAttempts spread over last 30 days
  // 9 SAVED, 5 CHURNED, 1 PENDING
  const cancellationDefs = [
    { id: 'seed-ca-01', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 0 },
    { id: 'seed-ca-02', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 1 },
    { id: 'seed-ca-03', outcome: 'CHURNED' as const, saveOfferId: null, i: 2 },
    { id: 'seed-ca-04', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 3 },
    { id: 'seed-ca-05', outcome: 'CHURNED' as const, saveOfferId: null, i: 4 },
    { id: 'seed-ca-06', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 5 },
    { id: 'seed-ca-07', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 6 },
    { id: 'seed-ca-08', outcome: 'CHURNED' as const, saveOfferId: null, i: 7 },
    { id: 'seed-ca-09', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 8 },
    { id: 'seed-ca-10', outcome: 'CHURNED' as const, saveOfferId: null, i: 9 },
    { id: 'seed-ca-11', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 10 },
    { id: 'seed-ca-12', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 11 },
    { id: 'seed-ca-13', outcome: 'SAVED' as const, saveOfferId: discountOffer.id, i: 12 },
    { id: 'seed-ca-14', outcome: 'CHURNED' as const, saveOfferId: null, i: 13 },
    { id: 'seed-ca-15', outcome: 'PENDING' as const, saveOfferId: null, i: 14 },
  ];

  for (const ca of cancellationDefs) {
    const existing = await prisma.cancellationAttempt.findUnique({ where: { id: ca.id } });
    if (!existing) {
      await prisma.cancellationAttempt.create({
        data: {
          id: ca.id,
          tenantId: acme.id,
          externalCustomerId: `cus_demo_cancel_${ca.i.toString().padStart(2, '0')}`,
          saveOfferId: ca.saveOfferId,
          outcome: ca.outcome,
          occurredAt: new Date(Date.now() - ca.i * 2 * 86400000),
        },
      });
    }
  }

  // ── Module 3: Dispute Evidence ──────────────────────────────────────────────

  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 86400000);
  const in10Days = new Date(now.getTime() + 10 * 86400000);

  const disputeDefs = [
    {
      id: 'seed-disp-001',
      stripeDisputeId: 'in_test_disp_001',
      status: 'OPEN' as const,
      amount: 8900,
      evidenceDueBy: in3Days,
    },
    {
      id: 'seed-disp-002',
      stripeDisputeId: 'in_test_disp_002',
      status: 'UNDER_REVIEW' as const,
      amount: 14900,
      evidenceDueBy: in10Days,
    },
    {
      id: 'seed-disp-003',
      stripeDisputeId: 'in_test_disp_003',
      status: 'WON' as const,
      amount: 4900,
      evidenceDueBy: null,
    },
    {
      id: 'seed-disp-004',
      stripeDisputeId: 'in_test_disp_004',
      status: 'LOST' as const,
      amount: 8900,
      evidenceDueBy: null,
    },
  ];

  for (const d of disputeDefs) {
    await prisma.dispute.upsert({
      where: { tenantId_stripeDisputeId: { tenantId: acme.id, stripeDisputeId: d.stripeDisputeId } },
      update: {},
      create: {
        id: d.id,
        tenantId: acme.id,
        stripeDisputeId: d.stripeDisputeId,
        status: d.status,
        amount: d.amount,
        evidenceDueBy: d.evidenceDueBy,
      },
    });
  }

  // EvidenceBundle for UNDER_REVIEW dispute (in_test_disp_002)
  const existingBundle = await prisma.evidenceBundle.findFirst({
    where: { tenantId: acme.id, disputeId: 'seed-disp-002' },
  });
  if (!existingBundle) {
    await prisma.evidenceBundle.create({
      data: {
        tenantId: acme.id,
        disputeId: 'seed-disp-002',
        orderData: {
          orderId: 'ORD-2024-8821',
          orderDate: '2024-11-15',
          customerEmail: 'john.doe@example.com',
          productDescription: 'Ethiopian Yirgacheffe 250g Monthly Subscription',
          orderTotal: 14900,
          shippingAddress: '123 Main St, Portland OR 97201',
        },
        shippingData: {
          carrier: 'USPS',
          trackingNumber: '9400111899223456789012',
          deliveredAt: '2024-11-18',
          deliveryConfirmation: 'Delivered - Front Door',
        },
        commsLog: {
          emails: [
            {
              date: '2024-11-10',
              subject: 'Order Confirmation',
              from: 'orders@acmecoffee.com',
            },
          ],
          supportTickets: [],
        },
        submittedAt: new Date(),
      },
    });
  }

  // ── Module 4: Accounting Sync ───────────────────────────────────────────────

  await prisma.accountingConnection.upsert({
    where: { tenantId_provider: { tenantId: acme.id, provider: 'QUICKBOOKS' } },
    update: {},
    create: {
      tenantId: acme.id,
      provider: 'QUICKBOOKS',
      encryptedAccessToken: demoEncrypt({ accessToken: 'qb_demo_access_token' }),
      encryptedRefreshToken: demoEncrypt({ refreshToken: 'qb_demo_refresh_token' }),
      tokenExpiresAt: new Date(Date.now() + 25 * 60 * 1000), // 25 minutes from seed
      realmId: '1234567890',
    },
  });

  // 12 SyncedTransactions: 9 SYNCED, 2 FAILED, 1 PENDING
  const syncedTxnDefs = [
    { id: 'seed-stx-01', stripeTxnId: 'ch_test_demo_001', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-001', errorMessage: null },
    { id: 'seed-stx-02', stripeTxnId: 'ch_test_demo_002', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-002', errorMessage: null },
    { id: 'seed-stx-03', stripeTxnId: 'ch_test_demo_003', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-003', errorMessage: null },
    { id: 'seed-stx-04', stripeTxnId: 'ch_test_demo_004', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-004', errorMessage: null },
    { id: 'seed-stx-05', stripeTxnId: 'ch_test_demo_005', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-005', errorMessage: null },
    { id: 'seed-stx-06', stripeTxnId: 'ch_test_demo_006', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-006', errorMessage: null },
    { id: 'seed-stx-07', stripeTxnId: 'ch_test_demo_007', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-007', errorMessage: null },
    { id: 'seed-stx-08', stripeTxnId: 'ch_test_demo_008', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-008', errorMessage: null },
    { id: 'seed-stx-09', stripeTxnId: 'ch_test_demo_009', syncStatus: 'SYNCED' as const, accountingEntryId: 'QB-ENTRY-009', errorMessage: null },
    { id: 'seed-stx-10', stripeTxnId: 'ch_test_demo_010', syncStatus: 'FAILED' as const, accountingEntryId: null, errorMessage: 'Account mapping not found for fee category' },
    { id: 'seed-stx-11', stripeTxnId: 'ch_test_demo_011', syncStatus: 'FAILED' as const, accountingEntryId: null, errorMessage: 'Account mapping not found for fee category' },
    { id: 'seed-stx-12', stripeTxnId: 'ch_test_demo_012', syncStatus: 'PENDING' as const, accountingEntryId: null, errorMessage: null },
  ];

  for (const stx of syncedTxnDefs) {
    await prisma.syncedTransaction.upsert({
      where: { tenantId_stripeTxnId: { tenantId: acme.id, stripeTxnId: stx.stripeTxnId } },
      update: {},
      create: {
        id: stx.id,
        tenantId: acme.id,
        stripeTxnId: stx.stripeTxnId,
        syncStatus: stx.syncStatus,
        accountingEntryId: stx.accountingEntryId,
        errorMessage: stx.errorMessage,
        syncedAt: stx.syncStatus === 'SYNCED' ? new Date(Date.now() - 86400000) : null,
      },
    });
  }

  // ── Module 5: Branded Invoices ──────────────────────────────────────────────

  const invoiceTemplate = await prisma.invoiceTemplate.upsert({
    where: { id: 'seed-tmpl-acme-default' },
    update: {},
    create: {
      id: 'seed-tmpl-acme-default',
      tenantId: acme.id,
      isDefault: true,
      brandingJson: {
        companyName: 'Acme Coffee Roasters',
        logoUrl: 'https://placehold.co/200x60/6F4E37/FFFFFF?text=ACME+COFFEE',
        primaryColor: '#6F4E37',
        accentColor: '#D4A373',
        footerText: 'Thank you! Questions? hello@acmecoffee.com',
        address: '456 Roaster Lane, Portland, OR 97201',
      },
      localeSettings: {
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
      taxSettings: {
        showTax: true,
        taxLabel: 'Sales Tax',
        taxRate: 0.0875,
      },
    },
  });

  const generatedInvoiceDefs = [
    { id: 'seed-inv-001', stripeInvoiceId: 'in_test_inv_001' },
    { id: 'seed-inv-002', stripeInvoiceId: 'in_test_inv_002' },
    { id: 'seed-inv-003', stripeInvoiceId: 'in_test_inv_003' },
    { id: 'seed-inv-004', stripeInvoiceId: 'in_test_inv_004' },
    { id: 'seed-inv-005', stripeInvoiceId: 'in_test_inv_005' },
  ];

  for (const inv of generatedInvoiceDefs) {
    await prisma.generatedInvoice.upsert({
      where: { tenantId_stripeInvoiceId: { tenantId: acme.id, stripeInvoiceId: inv.stripeInvoiceId } },
      update: {},
      create: {
        id: inv.id,
        tenantId: acme.id,
        templateId: invoiceTemplate.id,
        stripeInvoiceId: inv.stripeInvoiceId,
        pdfS3Key: `invoices/${acme.id}/${inv.stripeInvoiceId}.pdf`,
        language: 'en',
      },
    });
  }

  // ── Module 6: Webhook Monitor ───────────────────────────────────────────────

  // 20 WebhookEvents spread over last 7 days
  // 14 PROCESSED, 4 FAILED, 1 RECEIVED, 1 REPLAYED
  const eventTypes = [
    'invoice.paid',
    'customer.subscription.updated',
    'order.created',
    'payment_intent.succeeded',
  ];

  const webhookDefs = [
    // 1 RECEIVED
    { id: 'seed-wh-01', eventId: 'evt_test_recv_001', status: 'RECEIVED' as const, provider: 'STRIPE' as const, eventType: 'invoice.paid', errorMessage: null, daysAgo: 0 },
    // 1 REPLAYED
    { id: 'seed-wh-02', eventId: 'evt_test_repl_001', status: 'REPLAYED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: null, daysAgo: 1 },
    // 4 FAILED
    { id: 'seed-wh-03', eventId: 'evt_test_demo_001', status: 'FAILED' as const, provider: 'STRIPE' as const, eventType: 'invoice.paid', errorMessage: 'Timeout processing order fulfillment', daysAgo: 1 },
    { id: 'seed-wh-04', eventId: 'evt_test_demo_002', status: 'FAILED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: 'Timeout processing order fulfillment', daysAgo: 2 },
    { id: 'seed-wh-05', eventId: 'evt_test_demo_003', status: 'FAILED' as const, provider: 'STRIPE' as const, eventType: 'payment_intent.succeeded', errorMessage: 'Timeout processing order fulfillment', daysAgo: 3 },
    { id: 'seed-wh-06', eventId: 'evt_test_demo_004', status: 'FAILED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: 'Timeout processing order fulfillment', daysAgo: 4 },
    // 14 PROCESSED
    { id: 'seed-wh-07', eventId: 'evt_test_demo_005', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'invoice.paid', errorMessage: null, daysAgo: 0 },
    { id: 'seed-wh-08', eventId: 'evt_test_demo_006', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: null, daysAgo: 0 },
    { id: 'seed-wh-09', eventId: 'evt_test_demo_007', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'customer.subscription.updated', errorMessage: null, daysAgo: 1 },
    { id: 'seed-wh-10', eventId: 'evt_test_demo_008', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: null, daysAgo: 1 },
    { id: 'seed-wh-11', eventId: 'evt_test_demo_009', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'payment_intent.succeeded', errorMessage: null, daysAgo: 2 },
    { id: 'seed-wh-12', eventId: 'evt_test_demo_010', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'invoice.paid', errorMessage: null, daysAgo: 2 },
    { id: 'seed-wh-13', eventId: 'evt_test_demo_011', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'order.created', errorMessage: null, daysAgo: 3 },
    { id: 'seed-wh-14', eventId: 'evt_test_demo_012', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'customer.subscription.updated', errorMessage: null, daysAgo: 3 },
    { id: 'seed-wh-15', eventId: 'evt_test_demo_013', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'invoice.paid', errorMessage: null, daysAgo: 4 },
    { id: 'seed-wh-16', eventId: 'evt_test_demo_014', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'payment_intent.succeeded', errorMessage: null, daysAgo: 4 },
    { id: 'seed-wh-17', eventId: 'evt_test_demo_015', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'customer.subscription.updated', errorMessage: null, daysAgo: 5 },
    { id: 'seed-wh-18', eventId: 'evt_test_demo_016', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: null, daysAgo: 5 },
    { id: 'seed-wh-19', eventId: 'evt_test_demo_017', status: 'PROCESSED' as const, provider: 'STRIPE' as const, eventType: 'invoice.paid', errorMessage: null, daysAgo: 6 },
    { id: 'seed-wh-20', eventId: 'evt_test_demo_018', status: 'PROCESSED' as const, provider: 'SHOPIFY' as const, eventType: 'order.created', errorMessage: null, daysAgo: 6 },
  ];
  void eventTypes;

  for (const wh of webhookDefs) {
    await prisma.webhookEvent.upsert({
      where: { provider_eventId: { provider: wh.provider, eventId: wh.eventId } },
      update: {},
      create: {
        id: wh.id,
        tenantId: acme.id,
        provider: wh.provider,
        eventType: wh.eventType,
        eventId: wh.eventId,
        payload: { demo: true, eventId: wh.eventId },
        status: wh.status,
        errorMessage: wh.errorMessage,
        receivedAt: new Date(Date.now() - wh.daysAgo * 86400000),
        processedAt: wh.status === 'PROCESSED' || wh.status === 'REPLAYED'
          ? new Date(Date.now() - wh.daysAgo * 86400000 + 5000)
          : null,
      },
    });
  }

  // 2 AlertRules
  const alertRuleDefs = [
    {
      id: 'seed-ar-001',
      name: 'Failed webhook alert',
      conditionJson: { status: 'FAILED', count_threshold: 1 },
      notificationChannel: 'slack',
      notificationTarget: 'https://hooks.slack.com/demo/xxx',
      isActive: true,
    },
    {
      id: 'seed-ar-002',
      name: 'High failure rate',
      conditionJson: { failure_rate_pct: 10, window_minutes: 60 },
      notificationChannel: 'email',
      notificationTarget: 'ops@acmecoffee.com',
      isActive: true,
    },
  ];

  for (const ar of alertRuleDefs) {
    const existing = await prisma.alertRule.findUnique({ where: { id: ar.id } });
    if (!existing) {
      await prisma.alertRule.create({
        data: {
          id: ar.id,
          tenantId: acme.id,
          name: ar.name,
          conditionJson: ar.conditionJson,
          notificationChannel: ar.notificationChannel,
          notificationTarget: ar.notificationTarget,
          isActive: ar.isActive,
        },
      });
    }
  }

  // ── Tenant B: PixelForge Studio ─────────────────────────────────────────────
  const pixel = await prisma.tenant.upsert({
    where: { stripeCustomerId: 'cus_demo_pixel' },
    update: { name: 'PixelForge Studio', plan: 'STARTER', billingStatus: 'ACTIVE' },
    create: {
      name: 'PixelForge Studio',
      plan: 'STARTER',
      billingStatus: 'ACTIVE',
      stripeCustomerId: 'cus_demo_pixel',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: pixel.id, email: 'demo@pixelforge.com' } },
    update: { passwordHash, role: 'OWNER' },
    create: {
      tenantId: pixel.id,
      email: 'demo@pixelforge.com',
      passwordHash,
      role: 'OWNER',
    },
  });

  await prisma.connection.upsert({
    where: { tenantId_provider: { tenantId: pixel.id, provider: 'STRIPE' } },
    update: {},
    create: {
      tenantId: pixel.id,
      provider: 'STRIPE',
      encryptedCredentials: demoEncrypt({ accessToken: 'sk_test_demo_pixel_stripe' }),
      scopes: ['read_write'],
      status: 'ACTIVE',
    },
  });

  // 3 FailedPayments: PENDING
  const pixelFpDefs = [
    { id: 'seed-pfp-001', stripeInvoiceId: 'in_test_pixel_001', amount: 1900 },
    { id: 'seed-pfp-002', stripeInvoiceId: 'in_test_pixel_002', amount: 2900 },
    { id: 'seed-pfp-003', stripeInvoiceId: 'in_test_pixel_003', amount: 4900 },
  ];

  for (const fp of pixelFpDefs) {
    await prisma.failedPayment.upsert({
      where: { tenantId_stripeInvoiceId: { tenantId: pixel.id, stripeInvoiceId: fp.stripeInvoiceId } },
      update: {},
      create: {
        id: fp.id,
        tenantId: pixel.id,
        stripeInvoiceId: fp.stripeInvoiceId,
        stripeCustomerId: 'cus_demo_pixel',
        amount: fp.amount,
        status: 'PENDING',
        retryCount: 0,
        failureReason: 'insufficient_funds',
      },
    });
  }

  // 5 WebhookEvents: all PROCESSED
  const pixelWebhookDefs = [
    { id: 'seed-pwh-01', eventId: 'evt_test_pixel_001', eventType: 'invoice.paid', daysAgo: 0 },
    { id: 'seed-pwh-02', eventId: 'evt_test_pixel_002', eventType: 'payment_intent.succeeded', daysAgo: 1 },
    { id: 'seed-pwh-03', eventId: 'evt_test_pixel_003', eventType: 'customer.subscription.updated', daysAgo: 2 },
    { id: 'seed-pwh-04', eventId: 'evt_test_pixel_004', eventType: 'invoice.paid', daysAgo: 3 },
    { id: 'seed-pwh-05', eventId: 'evt_test_pixel_005', eventType: 'payment_intent.succeeded', daysAgo: 4 },
  ];

  for (const wh of pixelWebhookDefs) {
    await prisma.webhookEvent.upsert({
      where: { provider_eventId: { provider: 'STRIPE', eventId: wh.eventId } },
      update: {},
      create: {
        id: wh.id,
        tenantId: pixel.id,
        provider: 'STRIPE',
        eventType: wh.eventType,
        eventId: wh.eventId,
        payload: { demo: true, eventId: wh.eventId },
        status: 'PROCESSED',
        receivedAt: new Date(Date.now() - wh.daysAgo * 86400000),
        processedAt: new Date(Date.now() - wh.daysAgo * 86400000 + 5000),
      },
    });
  }

  // 1 Dispute: OPEN, amount 29900
  await prisma.dispute.upsert({
    where: { tenantId_stripeDisputeId: { tenantId: pixel.id, stripeDisputeId: 'in_test_pixel_disp_001' } },
    update: {},
    create: {
      id: 'seed-pdisp-001',
      tenantId: pixel.id,
      stripeDisputeId: 'in_test_pixel_disp_001',
      status: 'OPEN',
      amount: 29900,
      evidenceDueBy: new Date(Date.now() + 5 * 86400000),
    },
  });

  console.log('✅  Demo seed complete.');
  console.log(`   Acme Coffee Roasters: ${acme.id}`);
  console.log(`   PixelForge Studio:    ${pixel.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
