import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Toast from '@radix-ui/react-toast';
import { connectionsApi, Provider } from '../api/connections';
import { auditApi } from '../api/audit';
import { tenantsApi, type Tenant } from '../api/tenants';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import type { AuditLog } from '../api/audit';

const PLAN_COLORS: Record<string, string> = {
  STARTER: 'bg-gray-100 text-gray-700',
  GROWTH: 'bg-blue-50 text-blue-700',
  SUITE: 'bg-violet-50 text-violet-700',
};

const PLANS: { name: string; key: Tenant['plan']; price: string; features: string[] }[] = [
  {
    name: 'Starter',
    key: 'STARTER',
    price: '$39',
    features: [
      'Dunning recovery',
      'Up to 500 customers',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    key: 'GROWTH',
    price: '$129',
    features: [
      'All Starter features',
      'Save Flow widget',
      'Webhook monitoring',
      'Up to 5,000 customers',
      'Priority support',
    ],
  },
  {
    name: 'Suite',
    key: 'SUITE',
    price: '$249',
    features: [
      'All Growth features',
      'Dispute management',
      'Accounting sync',
      'Unlimited customers',
      'Dedicated support',
    ],
  },
];

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  shopify: 'Shopify',
};

const AUDIT_COLUMNS: ColumnDef<AuditLog>[] = [
  { key: 'action', header: 'Action', render: (r) => r.action },
  { key: 'actor', header: 'Actor', render: (r) => r.actor },
  { key: 'resource', header: 'Resource', render: (r) => r.resource },
  {
    key: 'createdAt',
    header: 'Time',
    render: (r) => new Date(r.createdAt).toLocaleString(),
  },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [confirmDisconnect, setConfirmDisconnect] = useState<Provider | null>(
    null,
  );
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const { data: connections, isLoading: connLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: connectionsApi.listConnections,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => auditApi.getRecentLogs(10),
  });

  const { data: tenantData } = useQuery({
    queryKey: ['tenant'],
    queryFn: tenantsApi.getTenant,
  });

  const disconnect = useMutation({
    mutationFn: (provider: Provider) =>
      connectionsApi.disconnectConnection(provider),
    onSuccess: (_, provider) => {
      void qc.invalidateQueries({ queryKey: ['connections'] });
      setConfirmDisconnect(null);
      setToastMsg(`${PROVIDER_LABELS[provider]} disconnected.`);
      setToastOpen(true);
    },
  });

  const upgradePlan = useMutation({
    mutationFn: (plan: Tenant['plan']) => tenantsApi.updatePlan(plan),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['tenant'] });
      setToastMsg(`Plan updated to ${updated.plan}.`);
      setToastOpen(true);
    },
    onError: () => {
      setToastMsg('Failed to update plan. Please try again.');
      setToastOpen(true);
    },
  });

  const currentPlan = tenantData?.plan ?? 'STARTER';

  return (
    <Toast.Provider>
      <div>
        <PageHeader title="Settings" subtitle="Manage your account and integrations" />

        {/* ── Platform Connections ── */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Platform Connections
          </h2>
          <div className="space-y-3">
            {connLoading
              ? [0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-gray-100"
                  />
                ))
              : connections?.map((conn) => (
                  <div
                    key={conn.provider}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold">
                        {conn.provider === 'stripe' ? 'S' : 'Sh'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {PROVIDER_LABELS[conn.provider]}
                        </p>
                        {conn.connectedAt && (
                          <p className="text-xs text-gray-500">
                            Connected{' '}
                            {new Date(conn.connectedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={conn.connected ? 'connected' : 'disconnected'}
                        label={conn.connected ? 'Active' : 'Disconnected'}
                      />
                      {conn.connected ? (
                        <button
                          onClick={() =>
                            setConfirmDisconnect(conn.provider)
                          }
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <a
                          href={
                            conn.provider === 'stripe'
                              ? '/api/v1/connections/stripe/oauth'
                              : '#'
                          }
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                        >
                          Connect {PROVIDER_LABELS[conn.provider]}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </section>

        {/* ── Subscription Plan ── */}
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Subscription Plan
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                PLAN_COLORS[currentPlan] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {currentPlan}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.key === currentPlan;
              return (
                <div
                  key={plan.key}
                  className={`rounded-xl border p-5 ${
                    isCurrent
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    {isCurrent && (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-2xl font-bold text-gray-900">
                    {plan.price}
                    <span className="text-sm font-normal text-gray-500">
                      /mo
                    </span>
                  </p>
                  <ul className="mb-4 space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-green-500">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <button
                      onClick={() => upgradePlan.mutate(plan.key)}
                      disabled={upgradePlan.isPending}
                      className="block w-full rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {upgradePlan.isPending ? 'Updating…' : `Upgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Recent Audit Log ── */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recent Audit Log
          </h2>
          <DataTable
            columns={AUDIT_COLUMNS}
            data={auditData?.data ?? []}
            isLoading={auditLoading}
            keyExtractor={(r) => r.id}
            emptyMessage="No audit events yet."
          />
        </section>

        {/* Disconnect confirmation dialog */}
        <Dialog.Root
          open={!!confirmDisconnect}
          onOpenChange={(open) => {
            if (!open) setConfirmDisconnect(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
              <Dialog.Title className="mb-2 text-lg font-semibold text-gray-900">
                Disconnect{' '}
                {confirmDisconnect
                  ? PROVIDER_LABELS[confirmDisconnect]
                  : ''}
                ?
              </Dialog.Title>
              <p className="mb-5 text-sm text-gray-500">
                This will stop syncing data from this provider. You can
                reconnect at any time.
              </p>
              <div className="flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => {
                    if (confirmDisconnect)
                      disconnect.mutate(confirmDisconnect);
                  }}
                  disabled={disconnect.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Toast.Root
          open={toastOpen}
          onOpenChange={setToastOpen}
          className="fixed bottom-6 right-6 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <Toast.Title>{toastMsg}</Toast.Title>
        </Toast.Root>
        <Toast.Viewport />
      </div>
    </Toast.Provider>
  );
}
