import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi, AccountingConnection, SyncEntry } from '../api/accounting';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';

const SYNC_COLUMNS: ColumnDef<SyncEntry>[] = [
  { key: 'stripeTxnId', header: 'Stripe Txn ID', render: (r) => r.stripeTxnId },
  {
    key: 'accountingEntryId',
    header: 'Accounting Entry',
    render: (r) => r.accountingEntryId ?? '—',
  },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'error',
    header: 'Error',
    render: (r) => (r.errorMessage ? (
      <span className="text-xs text-red-600">{r.errorMessage}</span>
    ) : '—'),
  },
];

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'quickbooks') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2CA01C] text-white">
        <span className="text-xs font-bold">QB</span>
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1AB4D7] text-white">
      <span className="text-xs font-bold">Xero</span>
    </div>
  );
}

const PROVIDER_INFO: Record<string, { label: string }> = {
  quickbooks: { label: 'QuickBooks' },
  xero: { label: 'Xero' },
};

export default function AccountingPage() {
  const qc = useQueryClient();

  const { data: connections, isLoading: connLoading } = useQuery({
    queryKey: ['accounting', 'connections'],
    queryFn: accountingApi.listConnections,
  });

  const { data: syncData, isLoading: syncLoading } = useQuery({
    queryKey: ['accounting', 'sync'],
    queryFn: () => accountingApi.getSyncStatus(),
  });

  const { data: report } = useQuery({
    queryKey: ['accounting', 'reconciliation'],
    queryFn: accountingApi.getReconciliationReport,
  });

  const triggerSync = useMutation({
    mutationFn: accountingApi.triggerSync,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['accounting', 'sync'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: accountingApi.disconnectAccounting,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'connections'] }),
  });

  const handleOAuth = (provider: 'quickbooks' | 'xero') => {
    window.location.href = `/api/v1/accounting/oauth/${provider}`;
  };

  return (
    <div>
      <PageHeader
        title="Accounting"
        subtitle="Sync transactions to your accounting software"
        action={
          <button
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {triggerSync.isPending ? 'Syncing…' : 'Trigger Sync'}
          </button>
        }
      />

      {/* Connections */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Connections</h2>
      {connLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(['quickbooks', 'xero'] as const).map((provider) => {
            const conn = (connections as AccountingConnection[])?.find(
              (c) => c.provider === provider,
            );
            const info = PROVIDER_INFO[provider];
            return (
              <div
                key={provider}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={provider} />
                  <div>
                    <p className="font-medium text-gray-900">{info.label}</p>
                    {conn?.lastSyncAt && (
                      <p className="text-xs text-gray-500">
                        Last sync: {new Date(conn.lastSyncAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={conn?.connected ? 'connected' : 'disconnected'}
                    label={conn?.connected ? 'Connected' : 'Disconnected'}
                  />
                  {conn?.connected ? (
                    <button
                      onClick={() => disconnect.mutate(provider)}
                      className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-700"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOAuth(provider)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Connect {info.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reconciliation summary */}
      {report && (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-medium text-gray-900">Reconciliation Report</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-center">
            {[
              { label: 'Total', value: report.totalTransactions },
              { label: 'Synced', value: report.synced },
              { label: 'Pending', value: report.pending },
              { label: 'Failed', value: report.failed },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync status table */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Sync Status</h2>
      <DataTable
        columns={SYNC_COLUMNS}
        data={syncData?.data ?? []}
        isLoading={syncLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No sync entries yet."
      />
    </div>
  );
}
