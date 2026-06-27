import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { dunningApi, PaymentStatus, CreateSequenceDto } from '../api/dunning';
import StatCard from '../components/ui/StatCard';
import { DollarSignIcon, ClockIcon, TrendingUpIcon } from '../components/ui/Icons';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';
import type { FailedPayment } from '../api/dunning';

const sequenceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  steps: z.array(
    z.object({
      day: z.coerce.number().min(0),
      channel: z.enum(['EMAIL', 'SMS']),
      subject: z.string().optional(),
      message: z.string().optional(),
    }),
  ),
});

type SequenceForm = z.infer<typeof sequenceSchema>;

const PAYMENT_COLUMNS: ColumnDef<FailedPayment>[] = [
  { key: 'stripeInvoiceId', header: 'Invoice ID', render: (r) => r.stripeInvoiceId },
  { key: 'customer', header: 'Customer', render: (r) => r.stripeCustomerId },
  {
    key: 'amount',
    header: 'Amount',
    render: (r) => `$${(r.amount / 100).toFixed(2)}`,
  },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'retryCount', header: 'Retries', render: (r) => r.retryCount },
  {
    key: 'nextRetry',
    header: 'Next Retry',
    render: (r) =>
      r.nextRetryAt ? new Date(r.nextRetryAt).toLocaleDateString() : '—',
  },
];

export default function DunningPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dunning', 'stats'],
    queryFn: dunningApi.getStats,
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['dunning', 'payments', statusFilter],
    queryFn: () => dunningApi.listFailedPayments(statusFilter ? { status: statusFilter } : {}),
  });

  const { data: sequences, isLoading: seqLoading } = useQuery({
    queryKey: ['dunning', 'sequences'],
    queryFn: dunningApi.listSequences,
  });

  const createSeq = useMutation({
    mutationFn: (dto: CreateSequenceDto) => dunningApi.createSequence(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dunning', 'sequences'] });
      setDialogOpen(false);
    },
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<SequenceForm>({
    resolver: zodResolver(sequenceSchema),
    defaultValues: { name: '', steps: [{ day: 1, channel: 'EMAIL' as const }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'steps' });

  const onSubmitSeq = (values: SequenceForm) => {
    createSeq.mutate({
      name: values.name,
      steps: values.steps.map((s) => ({
        delayDays: s.day,
        channel: s.channel.toLowerCase() as 'email' | 'sms',
        subject: s.subject || undefined,
        message: s.message || undefined,
      })),
      isDefault: false,
    });
    reset();
  };

  return (
    <div>
      <PageHeader
        title="Dunning"
        subtitle="Recover failed payments automatically"
        action={
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                + New Sequence
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                <Dialog.Title className="mb-4 text-lg font-semibold">
                  Create Recovery Sequence
                </Dialog.Title>
                <form onSubmit={handleSubmit(onSubmitSeq)} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Sequence Name
                    </label>
                    <input
                      {...register('name')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. Standard Recovery"
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Steps</label>
                      <button
                        type="button"
                        onClick={() =>
                          append({ day: (fields.length + 1) * 3, channel: 'EMAIL' as const })
                        }
                        className="text-xs text-brand-600 hover:underline"
                      >
                        + Add step
                      </button>
                    </div>
                    {fields.map((field, idx) => (
                      <div key={field.id} className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex gap-2">
                          <div className="flex flex-col">
                            <label className="mb-0.5 text-xs text-gray-500">Day</label>
                            <input
                              type="number"
                              {...register(`steps.${idx}.day`)}
                              placeholder="0"
                              className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div className="flex flex-col">
                            <label className="mb-0.5 text-xs text-gray-500">Channel</label>
                            <select
                              {...register(`steps.${idx}.channel`)}
                              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                            >
                              <option value="EMAIL">Email</option>
                              <option value="SMS">SMS</option>
                            </select>
                          </div>
                          <div className="flex flex-1 flex-col">
                            <label className="mb-0.5 text-xs text-gray-500">Subject (optional)</label>
                            <input
                              {...register(`steps.${idx}.subject`)}
                              placeholder="Leave blank to use default"
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(idx)}
                              className="mt-4 text-red-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="mt-2">
                          <label className="mb-0.5 block text-xs text-gray-500">
                            Email body (optional — use {'{{amount}}'} and {'{{invoice}}'})
                          </label>
                          <textarea
                            {...register(`steps.${idx}.message`)}
                            rows={2}
                            placeholder="Leave blank to use the built-in escalating template"
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded-lg border px-4 py-2 text-sm"
                        onClick={() => reset()}
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={createSeq.isPending}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {createSeq.isPending ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        }
      />

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Recovered"
          value={
            stats
              ? `$${(stats.totalRecovered / 100).toFixed(2)}`
              : statsLoading
              ? '…'
              : '—'
          }
          icon={<DollarSignIcon className="h-5 w-5" />}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Recovering"
          value={stats ? stats.activeRecovering : statsLoading ? '…' : '—'}
          icon={<ClockIcon className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Success Rate"
          value={stats ? `${stats.successRate.toFixed(1)}%` : statsLoading ? '…' : '—'}
          icon={<TrendingUpIcon className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Filter + table */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | '')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="RECOVERING">Recovering</option>
          <option value="RECOVERED">Recovered</option>
          <option value="WRITTEN_OFF">Written Off</option>
        </select>
      </div>

      <DataTable
        columns={PAYMENT_COLUMNS}
        data={paymentsData?.data ?? []}
        isLoading={paymentsLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No failed payments found."
      />

      {/* Sequences */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recovery Sequences</h2>
        {seqLoading ? (
          <p className="text-sm text-gray-400">Loading sequences…</p>
        ) : sequences?.length === 0 ? (
          <p className="text-sm text-gray-400">No sequences yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {sequences?.map((seq) => (
              <div
                key={seq.id}
                className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{seq.name}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {seq.stepsJson.length} step{seq.stepsJson.length !== 1 ? 's' : ''} ·{' '}
                    {seq.stepsJson.map((s) => `Day ${s.delayDays} ${s.channel.toUpperCase()}`).join(', ')}
                  </p>
                </div>
                <StatusBadge
                  status={seq.isDefault ? 'RECOVERED' : 'PENDING'}
                  label={seq.isDefault ? 'Default' : 'Inactive'}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
