import {
  PrismaClient,
  Tenant,
  User,
  UserRole,
  Provider,
  Connection,
  FailedPayment,
  WebhookEvent,
  Dispute,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

/**
 * Truncates all tables in dependency-safe order (children before parents).
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  // Delete in FK-safe order (most-derived first)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    evidence_bundles,
    dispute_evidence_bundles,
    disputes,
    recovery_attempts,
    failed_payments,
    recovery_sequences,
    cancellation_attempts,
    save_offers,
    synced_transactions,
    accounting_connections,
    generated_invoices,
    invoice_templates,
    webhook_events,
    alert_rules,
    audit_logs,
    connections,
    refresh_tokens,
    users,
    tenants
    CASCADE`);
}

export async function seedTenant(
  prisma: PrismaClient,
  overrides: Partial<Tenant> = {},
): Promise<Tenant> {
  return prisma.tenant.create({
    data: {
      id: uuidv4(),
      name: 'Test Corp',
      plan: 'STARTER',
      billingStatus: 'TRIALING',
      ...overrides,
    },
  });
}

export async function seedUser(
  prisma: PrismaClient,
  tenantId: string,
  role: UserRole = 'MEMBER',
): Promise<{ user: User; password: string }> {
  const password = `Password123!-${uuidv4().slice(0, 8)}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      tenantId,
      email: `user-${uuidv4().slice(0, 8)}@example.com`,
      role,
      passwordHash,
    },
  });
  return { user, password };
}

export async function seedConnection(
  prisma: PrismaClient,
  tenantId: string,
  provider: Provider,
): Promise<Connection> {
  return prisma.connection.create({
    data: {
      id: uuidv4(),
      tenantId,
      provider,
      encryptedCredentials: `encrypted:sk_test_${uuidv4().replace(/-/g, '')}`,
      credentialKeyVersion: 1,
      scopes: ['read_write'],
      status: 'ACTIVE',
    },
  });
}

export async function seedFailedPayment(
  prisma: PrismaClient,
  tenantId: string,
): Promise<FailedPayment> {
  return prisma.failedPayment.create({
    data: {
      id: uuidv4(),
      tenantId,
      stripeInvoiceId: `in_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
      stripeCustomerId: `cus_test_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
      amount: 4999,
      currency: 'usd',
      failureReason: 'card_declined',
      status: 'PENDING',
    },
  });
}

export async function seedWebhookEvent(
  prisma: PrismaClient,
  tenantId: string,
): Promise<WebhookEvent> {
  return prisma.webhookEvent.create({
    data: {
      id: uuidv4(),
      tenantId,
      provider: 'STRIPE',
      eventType: 'invoice.payment_failed',
      eventId: `evt_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
      payload: {
        id: `evt_test_${uuidv4().replace(/-/g, '').slice(0, 20)}`,
        type: 'invoice.payment_failed',
      },
      status: 'RECEIVED',
    },
  });
}

export async function seedDispute(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Dispute> {
  return prisma.dispute.create({
    data: {
      id: uuidv4(),
      tenantId,
      stripeDisputeId: `dp_test_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      status: 'OPEN',
      amount: 2500,
      currency: 'usd',
      evidenceDueBy: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
