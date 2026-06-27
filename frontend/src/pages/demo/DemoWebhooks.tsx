import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { webhooksApi, WebhookEvent } from '../../api/webhooks';
import { demoApi } from '../../api/demo';
import DataTable, { ColumnDef } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { SimulateButton, LiveBadge } from './DemoShared';

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function DemoWebhooks() {
  const qc = useQueryClient();

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['webhooks', 'events', { limit: 20 }],
    queryFn: () => webhooksApi.listEvents({ limit: 20 }),
    refetchInterval: 10_000,
  });

  const { data: alertRules } = useQuery({
    queryKey: ['webhooks', 'alert-rules'],
    queryFn: webhooksApi.listAlertRules,
  });

  const simulateFailure = useMutation({
    mutationFn: () => demoApi.simulate('webhook-failure'),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['webhooks', 'events'] }),
  });

  const simulateReplay = useMutation({
    mutationFn: () => {
      const failed = eventsData?.data.find((e) => e.status === 'FAILED');
      if (failed) return webhooksApi.replayEvent(failed.id);
      return demoApi.simulate('replay');
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['webhooks', 'events'] }),
  });

  const events = eventsData?.data ?? [];
  const total = events.length || 1;
  const processedCount = events.filter((e) => e.status === 'PROCESSED').length;
  const healthPct = Math.round((processedCount / total) * 100);

  const gaugeData = [
    { name: 'Health', value: healthPct, fill: '#22c55e' },
  ];

  const COLUMNS: ColumnDef<WebhookEvent>[] = [
    {
      key: 'provider',
      header: 'Provider',
      render: (r) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            r.provider === 'stripe'
              ? 'bg-blue-50 text-blue-700'
              : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {r.provider === 'stripe' ? 'Stripe' : 'Shopify'}
        </span>
      ),
    },
    { key: 'eventType', header: 'Event Type', render: (r) => r.eventType },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'receivedAt',
      header: 'Received',
      render: (r) => (
        <span className="text-xs text-gray-500">
          {relativeTime(r.receivedAt)}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      render: (r) =>
        r.status === 'FAILED' ? (
          <button
            onClick={() =>
              webhooksApi
                .replayEvent(r.id)
                .then(() =>
                  qc.invalidateQueries({ queryKey: ['webhooks', 'events'] }),
                )
            }
            className="rounded-lg border px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            Replay
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Health gauge */}
      <div className="flex items-center gap-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="h-32 w-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius={35}
              outerRadius={60}
              data={gaugeData}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar dataKey="value" background />
              <Tooltip />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-sm text-gray-500">Webhook Health</p>
          <p className="text-4xl font-bold text-green-600">{healthPct}%</p>
          <p className="mt-1 text-xs text-gray-500">
            {processedCount} of {total} events processed
          </p>
        </div>
        <div className="ml-auto">
          <LiveBadge />
        </div>
      </div>

      {/* Event log */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between p-4">
          <h3 className="font-semibold text-gray-900">Event Log</h3>
          <span className="text-xs text-gray-400">Refreshes every 10s</span>
        </div>
        <DataTable
          columns={COLUMNS}
          data={events}
          isLoading={isLoading}
          keyExtractor={(r) => r.id}
          emptyMessage="No webhook events."
        />
      </div>

      {/* Simulate buttons */}
      <div className="flex flex-wrap gap-3">
        <SimulateButton
          label="Simulate Webhook Failure"
          onClick={() => simulateFailure.mutate()}
          loading={simulateFailure.isPending}
        />
        <SimulateButton
          label="Simulate Replay"
          onClick={() => simulateReplay.mutate()}
          loading={simulateReplay.isPending}
        />
      </div>

      {/* Alert rules */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-gray-900">Alert Rules</h3>
        {alertRules?.length === 0 ? (
          <p className="text-sm text-gray-400">No alert rules configured.</p>
        ) : (
          <ul className="space-y-2">
            {alertRules?.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <span className="text-sm text-gray-700">{rule.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    rule.notificationChannel === 'email'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-violet-50 text-violet-700'
                  }`}
                >
                  {rule.notificationChannel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
