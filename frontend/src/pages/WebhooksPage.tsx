import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  webhooksApi,
  WebhookStatus,
  CreateAlertRuleDto,
  WebhookEvent,
  AlertRule,
} from '../api/webhooks';
import { reportingApi } from '../api/reporting';
import DataTable, { ColumnDef } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';

const ruleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  condition: z.string().min(1, 'Condition is required'),
  notificationChannel: z.enum(['email', 'slack']),
  notificationTarget: z.string().min(1, 'Target is required'),
});
type RuleForm = z.infer<typeof ruleSchema>;

const EVENT_COLUMNS: ColumnDef<WebhookEvent>[] = [
  {
    key: 'provider',
    header: 'Provider',
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        r.provider === 'stripe' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
      }`}>
        {r.provider}
      </span>
    ),
  },
  { key: 'eventType', header: 'Event Type', render: (r) => r.eventType },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'receivedAt',
    header: 'Received',
    render: (r) => new Date(r.receivedAt).toLocaleString(),
  },
  { key: 'replay', header: '', render: () => null }, // filled below via wrapper
];

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<'stripe' | 'shopify' | ''>('');
  const [status, setStatus] = useState<WebhookStatus | ''>('');
  const [search, setSearch] = useState('');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['webhooks', 'events', provider, status, search],
    queryFn: () =>
      webhooksApi.listEvents({
        ...(provider ? { provider } : {}),
        ...(status ? { status } : {}),
        ...(search ? { eventType: search } : {}),
      }),
  });

  const { data: alertRules, isLoading: rulesLoading } = useQuery({
    queryKey: ['webhooks', 'alert-rules'],
    queryFn: webhooksApi.listAlertRules,
  });

  const { data: webhookStats } = useQuery({
    queryKey: ['webhooks', 'stats'],
    queryFn: reportingApi.getWebhookStats,
    refetchInterval: 30_000,
  });

  const replayMut = useMutation({
    mutationFn: webhooksApi.replayEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', 'events'] }),
  });

  const createRule = useMutation({
    mutationFn: (dto: CreateAlertRuleDto) => webhooksApi.createAlertRule(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['webhooks', 'alert-rules'] });
      setRuleDialogOpen(false);
    },
  });

  const deleteRule = useMutation({
    mutationFn: webhooksApi.deleteAlertRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', 'alert-rules'] }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { notificationChannel: 'email' },
  });

  const columns: ColumnDef<WebhookEvent>[] = [
    ...EVENT_COLUMNS.slice(0, 4),
    {
      key: 'replay',
      header: '',
      render: (r) => (
        <button
          onClick={() => replayMut.mutate(r.id)}
          disabled={replayMut.isPending}
          className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
        >
          Replay
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Webhooks"
        subtitle="Monitor incoming events and alerts"
        action={
          <Dialog.Root open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                + New Alert Rule
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                <Dialog.Title className="mb-4 text-lg font-semibold">
                  Create Alert Rule
                </Dialog.Title>
                <form
                  onSubmit={handleSubmit((v) => {
                    createRule.mutate({
                      name: v.name,
                      conditionJson: { expression: v.condition },
                      notificationChannel: v.notificationChannel,
                      notificationTarget: v.notificationTarget,
                    });
                    reset();
                  })}
                  className="space-y-4"
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Rule Name
                    </label>
                    <input
                      {...register('name')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. Failed payment alert"
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Condition
                    </label>
                    <input
                      {...register('condition')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. status == FAILED"
                    />
                    {errors.condition && (
                      <p className="mt-1 text-xs text-red-600">{errors.condition.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Channel</label>
                    <select
                      {...register('notificationChannel')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="email">Email</option>
                      <option value="slack">Slack</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Target</label>
                    <input
                      {...register('notificationTarget')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. ops@example.com or Slack webhook URL"
                    />
                    {errors.notificationTarget && (
                      <p className="mt-1 text-xs text-red-600">{errors.notificationTarget.message}</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Dialog.Close asChild>
                      <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => reset()}>
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={createRule.isPending}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {createRule.isPending ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        }
      />

      {/* Auto-retry stats */}
      {webhookStats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total (7d)', value: webhookStats.total, color: 'text-gray-900' },
            { label: 'Processed', value: webhookStats.processed, color: 'text-emerald-600' },
            { label: 'Auto-retrying', value: webhookStats.processing, color: 'text-amber-500' },
            { label: 'Failed', value: webhookStats.failed, color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'stripe' | 'shopify' | '')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All providers</option>
          <option value="stripe">Stripe</option>
          <option value="shopify">Shopify</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WebhookStatus | '')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="RECEIVED">Received</option>
          <option value="PROCESSING">Processing</option>
          <option value="PROCESSED">Processed</option>
          <option value="FAILED">Failed</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search event type…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={eventsData?.data ?? []}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="No webhook events found."
      />

      {/* Alert Rules */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Alert Rules</h2>
        {rulesLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : alertRules?.length === 0 ? (
          <p className="text-sm text-gray-400">No alert rules yet.</p>
        ) : (
          <div className="space-y-2">
            {(alertRules as AlertRule[])?.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                  <p className="text-xs text-gray-500">
                    {rule.notificationChannel} → {rule.notificationTarget}
                  </p>
                </div>
                <button
                  onClick={() => deleteRule.mutate(rule.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
