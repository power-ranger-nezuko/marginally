import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Toast from '@radix-ui/react-toast';
import { disputesApi, DisputeStatus, Dispute } from '../api/disputes';
import StatCard from '../components/ui/StatCard';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import { ScaleIcon, SearchIcon, CheckCircleIcon, TrendingUpIcon } from '../components/ui/Icons';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';

function evidenceDueCellClass(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return 'text-red-600 font-semibold';
  if (diff < 3) return 'text-red-500 font-medium';
  return 'text-gray-700';
}

function EvidenceDueCell({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return <span className="text-gray-400">—</span>;
  const diff = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  const label =
    diff < 0
      ? 'Overdue'
      : diff < 1
      ? 'Today'
      : `${Math.ceil(diff)}d left`;
  return <span className={evidenceDueCellClass(dateStr)}>{label}</span>;
}

interface EvidenceForm {
  orderData: string;
  shippingData: string;
  commsLog: string;
}

export default function DisputesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | ''>('');
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceForm>({
    orderData: '',
    shippingData: '',
    commsLog: '',
  });
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dispute-stats'],
    queryFn: disputesApi.getStats,
  });

  const { data: disputesData, isLoading: disputesLoading } = useQuery({
    queryKey: ['disputes', { status: statusFilter }],
    queryFn: () =>
      disputesApi.listDisputes(statusFilter ? { status: statusFilter } : {}),
  });

  const submitEvidence = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: EvidenceForm }) =>
      disputesApi.submitEvidence(id, {
        orderData: dto.orderData || undefined,
        shippingData: dto.shippingData || undefined,
        commsLog: dto.commsLog || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['disputes'] });
      setSelectedDispute(null);
      setToastMsg('Evidence submitted successfully.');
      setToastOpen(true);
    },
  });

  const openDialog = (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setEvidenceForm({
      orderData: dispute.evidenceBundle?.orderData ?? '',
      shippingData: dispute.evidenceBundle?.shippingData ?? '',
      commsLog: dispute.evidenceBundle?.commsLog ?? '',
    });
  };

  const underReview = disputesData?.data.filter(
    (d) => d.status === 'UNDER_REVIEW',
  ).length ?? 0;

  const COLUMNS: ColumnDef<Dispute>[] = [
    {
      key: 'id',
      header: 'Dispute ID',
      render: (r) => (
        <span className="font-mono text-xs text-gray-600">
          {r.stripeDisputeId.slice(0, 18)}…
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (r) =>
        `${r.currency.toUpperCase()} ${(r.amount / 100).toFixed(2)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'evidenceDue',
      header: 'Evidence Due',
      render: (r) => <EvidenceDueCell dateStr={r.evidenceDueBy} />,
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) =>
        r.status === 'OPEN' || r.status === 'UNDER_REVIEW' ? (
          <button
            onClick={() => openDialog(r)}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
          >
            Submit Evidence
          </button>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
  ];

  return (
    <Toast.Provider>
      <div>
        <PageHeader title="Disputes" subtitle="Manage and respond to payment disputes" />

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard
            label="Open Disputes"
            value={stats ? stats.open : statsLoading ? '…' : '—'}
            icon={<ScaleIcon className="h-5 w-5" />}
            accent="bg-orange-50 text-orange-600"
          />
          <StatCard
            label="Under Review"
            value={statsLoading ? '…' : underReview}
            icon={<SearchIcon className="h-5 w-5" />}
            accent="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Won"
            value={stats ? stats.wonCount : statsLoading ? '…' : '—'}
            icon={<CheckCircleIcon className="h-5 w-5" />}
            accent="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Win Rate"
            value={
              stats
                ? `${stats.winRate.toFixed(1)}%`
                : statsLoading
                ? '…'
                : '—'
            }
            icon={<TrendingUpIcon className="h-5 w-5" />}
            accent="bg-violet-50 text-violet-600"
            trend={stats ? (stats.winRate > 50 ? 1 : -1) : undefined}
          />
        </div>

        {/* Filter */}
        <div className="mb-4 flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as DisputeStatus | '')
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="NEEDS_RESPONSE">Needs Response</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </div>

        <DataTable
          columns={COLUMNS}
          data={disputesData?.data ?? []}
          isLoading={disputesLoading}
          keyExtractor={(r) => r.id}
          emptyMessage="No disputes found."
        />

        {/* Submit Evidence Dialog */}
        <Dialog.Root
          open={!!selectedDispute}
          onOpenChange={(open) => {
            if (!open) setSelectedDispute(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
              <Dialog.Title className="mb-1 text-lg font-semibold">
                Submit Evidence
              </Dialog.Title>
              {selectedDispute && (
                <p className="mb-4 text-sm text-gray-500">
                  Dispute{' '}
                  <span className="font-mono text-xs">
                    {selectedDispute.stripeDisputeId}
                  </span>{' '}
                  · ${(selectedDispute.amount / 100).toFixed(2)}{' '}
                  {selectedDispute.currency.toUpperCase()}
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Order Data
                  </label>
                  <textarea
                    rows={3}
                    value={evidenceForm.orderData}
                    onChange={(e) =>
                      setEvidenceForm((f) => ({
                        ...f,
                        orderData: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                    placeholder='{"orderId": "...", "items": [...]}'
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Shipping Data
                  </label>
                  <textarea
                    rows={3}
                    value={evidenceForm.shippingData}
                    onChange={(e) =>
                      setEvidenceForm((f) => ({
                        ...f,
                        shippingData: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                    placeholder='{"trackingNumber": "...", "carrier": "..."}'
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Communications Log
                  </label>
                  <textarea
                    rows={3}
                    value={evidenceForm.commsLog}
                    onChange={(e) =>
                      setEvidenceForm((f) => ({
                        ...f,
                        commsLog: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                    placeholder='[{"date": "...", "message": "..."}]'
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => {
                    if (!selectedDispute) return;
                    submitEvidence.mutate({
                      id: selectedDispute.id,
                      dto: evidenceForm,
                    });
                  }}
                  disabled={submitEvidence.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitEvidence.isPending ? 'Submitting…' : 'Submit Evidence'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Toast */}
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
