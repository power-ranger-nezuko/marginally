import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  saveflowApi,
  OfferType,
  SaveOffer,
  CreateOfferDto,
  SaveAttempt,
} from '../api/saveflow';
import StatCard from '../components/ui/StatCard';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';
import { HeartHandshakeIcon, TrendingDownIcon, TrendingUpIcon, DollarSignIcon } from '../components/ui/Icons';

const offerSchema = z.object({
  type: z.enum(['DISCOUNT', 'PAUSE', 'DOWNGRADE']),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  pauseDurationDays: z.coerce.number().min(1).optional(),
  targetPlan: z.string().optional(),
});
type OfferForm = z.infer<typeof offerSchema>;

const ATTEMPT_COLUMNS: ColumnDef<SaveAttempt>[] = [
  { key: 'externalCustomerId', header: 'Customer ID', render: (r) => r.externalCustomerId },
  { key: 'offerType', header: 'Offer', render: (r) => <StatusBadge status={r.saveOffer?.type ?? 'PENDING'} /> },
  { key: 'outcome', header: 'Outcome', render: (r) => <StatusBadge status={r.outcome} /> },
  {
    key: 'date',
    header: 'Date',
    render: (r) => new Date(r.occurredAt).toLocaleDateString(),
  },
];

export default function SaveFlowPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['saveflow', 'stats'],
    queryFn: saveflowApi.getStats,
  });

  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: ['saveflow', 'offers'],
    queryFn: saveflowApi.listOffers,
  });

  const { data: attemptsData, isLoading: attemptsLoading } = useQuery({
    queryKey: ['saveflow', 'attempts'],
    queryFn: () => saveflowApi.listAttempts(),
  });

  const createOffer = useMutation({
    mutationFn: (dto: CreateOfferDto) => saveflowApi.createOffer(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saveflow', 'offers'] });
      setDialogOpen(false);
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors: _offerErrors },
  } = useForm<OfferForm>({
    resolver: zodResolver(offerSchema),
    defaultValues: { type: 'DISCOUNT' },
  });

  const selectedType = watch('type');

  const onSubmit = (values: OfferForm) => {
    const dto: CreateOfferDto = {
      type: values.type as OfferType,
      configJson: {
        discountPercent: values.discountPercent,
        pauseDurationDays: values.pauseDurationDays,
        targetPlan: values.targetPlan,
      },
    };
    createOffer.mutate(dto);
    reset();
  };

  return (
    <div>
      <PageHeader
        title="Save Flow"
        subtitle="Reduce churn with smart cancellation offers"
        action={
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                + New Offer
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                <Dialog.Title className="mb-4 text-lg font-semibold">
                  Create Save Offer
                </Dialog.Title>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Offer Type
                    </label>
                    <select
                      {...register('type')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="DISCOUNT">Discount</option>
                      <option value="PAUSE">Pause Subscription</option>
                      <option value="DOWNGRADE">Downgrade Plan</option>
                    </select>
                  </div>

                  {selectedType === 'DISCOUNT' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Discount %
                      </label>
                      <input
                        type="number"
                        {...register('discountPercent')}
                        placeholder="e.g. 20"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {selectedType === 'PAUSE' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Pause Duration (days)
                      </label>
                      <input
                        type="number"
                        {...register('pauseDurationDays')}
                        placeholder="e.g. 30"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {selectedType === 'DOWNGRADE' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Target Plan
                      </label>
                      <input
                        {...register('targetPlan')}
                        placeholder="e.g. STARTER"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

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
                      disabled={createOffer.isPending}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {createOffer.isPending ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        }
      />

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saved" value={stats?.savedCount ?? '—'} icon={<HeartHandshakeIcon className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Churned" value={stats?.churnedCount ?? '—'} icon={<TrendingDownIcon className="h-5 w-5" />} accent="bg-red-50 text-red-500" />
        <StatCard
          label="Save Rate"
          value={stats ? `${stats.saveRate.toFixed(1)}%` : '—'}
          icon={<TrendingUpIcon className="h-5 w-5" />}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Saved MRR"
          value={
            stats
              ? `$${(stats.savedMrr / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : '—'
          }
          icon={<DollarSignIcon className="h-5 w-5" />}
          accent="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Offers list */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Save Offers</h2>
      {offersLoading ? (
        <p className="text-sm text-gray-400">Loading offers…</p>
      ) : (
        <div className="mb-8 space-y-2">
          {(offers as SaveOffer[])?.map((offer) => (
            <div
              key={offer.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={offer.type} />
                <span className="text-sm text-gray-700">
                  {offer.type === 'DISCOUNT' &&
                    `${offer.configJson.discountPercent}% off`}
                  {offer.type === 'PAUSE' &&
                    `Pause for ${offer.configJson.pauseDurationDays} days`}
                  {offer.type === 'DOWNGRADE' &&
                    `Downgrade to ${offer.configJson.targetPlan}`}
                </span>
              </div>
              <StatusBadge
                status={offer.isActive ? 'RECOVERED' : 'PENDING'}
                label={offer.isActive ? 'Active' : 'Inactive'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Attempts table */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Recent Attempts</h2>
      <DataTable
        columns={ATTEMPT_COLUMNS}
        data={attemptsData?.data ?? []}
        isLoading={attemptsLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No save attempts yet."
      />
    </div>
  );
}
