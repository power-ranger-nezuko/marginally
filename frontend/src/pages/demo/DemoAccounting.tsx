import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountingApi, SyncEntry } from '../../api/accounting';
import { demoApi } from '../../api/demo';
import DataTable, { ColumnDef } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { SimulateButton } from './DemoShared';

const FIELD_MAPPINGS = [
  {
    src: 'Stripe charge.amount',
    dst: 'QB Sales Receipt > Amount',
  },
  {
    src: 'Stripe fee',
    dst: 'QB Expense > Processing Fee',
  },
  {
    src: 'Stripe net',
    dst: 'QB Bank Deposit > Net',
  },
  {
    src: 'Stripe refund',
    dst: 'QB Credit Memo',
  },
];

function MappingDiagram() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">
        Field Mapping: Stripe → QuickBooks
      </h3>
      <div className="space-y-2">
        {FIELD_MAPPINGS.map((m) => (
          <div key={m.src} className="flex items-center gap-3">
            <span className="flex-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 text-right">
              {m.src}
            </span>
            <span className="text-gray-400">→</span>
            <span className="flex-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              {m.dst}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DemoAccounting() {
  const qc = useQueryClient();
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const { data: connections } = useQuery({
    queryKey: ['accounting', 'connections'],
    queryFn: accountingApi.listConnections,
  });

  const { data: syncData, isLoading } = useQuery({
    queryKey: ['accounting', 'sync', {}],
    queryFn: () => accountingApi.getSyncStatus({}),
  });

  const triggerSync = useMutation({
    mutationFn: () => demoApi.simulate('accounting-sync'),
    onSuccess: async () => {
      const pending = syncData?.data.find((s) => s.status === 'PENDING');
      if (pending) {
        setAnimatingId(pending.id);
        setTimeout(() => setAnimatingId(null), 1500);
      }
      await qc.invalidateQueries({ queryKey: ['accounting', 'sync'] });
    },
  });

  const qbConnection = connections?.find((c) => c.provider === 'quickbooks');

  const COLUMNS: ColumnDef<SyncEntry>[] = [
    {
      key: 'stripeTxnId',
      header: 'Stripe Txn',
      render: (r) => (
        <span className="font-mono text-xs text-gray-600">
          {r.stripeTxnId.slice(0, 14)}…
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div
          className={
            r.id === animatingId
              ? 'transition-all duration-700 ease-in-out'
              : ''
          }
        >
          <StatusBadge
            status={r.id === animatingId ? 'SYNCED' : r.status}
          />
        </div>
      ),
    },
    {
      key: 'syncedAt',
      header: 'Synced At',
      render: (r) =>
        r.syncedAt
          ? new Date(r.syncedAt).toLocaleString()
          : '—',
    },
    {
      key: 'error',
      header: 'Error',
      render: (r) =>
        r.errorMessage ? (
          <span
            title={r.errorMessage}
            className="cursor-help rounded bg-red-50 px-2 py-0.5 text-xs text-red-600"
          >
            {r.errorMessage.slice(0, 24)}…
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ];

  const synced = syncData?.data.filter((s) => s.status === 'SYNCED').length ?? 9;
  const failed = syncData?.data.filter((s) => s.status === 'FAILED').length ?? 2;
  const pending = syncData?.data.filter((s) => s.status === 'PENDING').length ?? 1;

  return (
    <div className="space-y-6">
      {/* QuickBooks connection card */}
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-xl font-bold text-emerald-700">
          QB
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">QuickBooks Online</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              Connected
            </span>
          </div>
          {qbConnection?.connectedAt && (
            <p className="text-xs text-gray-500">
              Connected{' '}
              {new Date(qbConnection.connectedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
          ⏱ Token expires in 25 min
        </span>
      </div>

      {/* Field mapping diagram */}
      <MappingDiagram />

      {/* Sync status summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{synced}</p>
          <p className="text-xs text-green-600">Synced</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{failed}</p>
          <p className="text-xs text-red-600">Failed</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{pending}</p>
          <p className="text-xs text-yellow-600">Pending</p>
        </div>
      </div>

      {/* Sync table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-semibold text-gray-900">Sync Entries</h3>
        </div>
        <DataTable
          columns={COLUMNS}
          data={syncData?.data ?? []}
          isLoading={isLoading}
          keyExtractor={(r) => r.id}
          emptyMessage="No sync entries."
        />
      </div>

      {/* Simulate trigger */}
      <div className="flex gap-3">
        <SimulateButton
          label="Trigger Sync"
          onClick={() => triggerSync.mutate()}
          loading={triggerSync.isPending}
        />
      </div>
    </div>
  );
}
