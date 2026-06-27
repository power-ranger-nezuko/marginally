import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { reportingApi } from '../api/reporting';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import {
  DollarSignIcon,
  TrendingUpIcon,
  ActivityIcon,
  ZapIcon,
} from '../components/ui/Icons';

const OFFER_COLORS: Record<string, string> = {
  DISCOUNT: '#4f46e5',
  PAUSE: '#0ea5e9',
  DOWNGRADE: '#8b5cf6',
};

export default function ReportingPage() {
  const [days, setDays] = useState(30);

  const { data: dunning, isLoading: dLoading } = useQuery({
    queryKey: ['reporting', 'dunning', days],
    queryFn: () => reportingApi.getDunningReport(days),
  });

  const { data: saveFlow, isLoading: sLoading } = useQuery({
    queryKey: ['reporting', 'saveflow'],
    queryFn: reportingApi.getSaveFlowReport,
  });

  const { data: webhooks, isLoading: wLoading } = useQuery({
    queryKey: ['reporting', 'webhooks'],
    queryFn: reportingApi.getWebhookStats,
  });

  const recoveredDollars = dunning ? `$${(dunning.recovered / 100).toFixed(0)}` : dLoading ? '…' : '$0';
  const recoveredTrend = dunning?.trend ?? undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recovery Report"
        subtitle="ROI from dunning and churn prevention"
        action={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      {/* ── Top KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue Recovered"
          value={recoveredDollars}
          icon={<DollarSignIcon className="h-5 w-5" />}
          trend={recoveredTrend}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Payments Recovered"
          value={dunning?.recoveredCount ?? (dLoading ? '…' : 0)}
          icon={<TrendingUpIcon className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Churn Save Rate"
          value={saveFlow ? `${saveFlow.saveRate}%` : sLoading ? '…' : '—'}
          icon={<ActivityIcon className="h-5 w-5" />}
          trend={saveFlow?.saveRateTrend ?? undefined}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Webhook Health"
          value={webhooks ? `${webhooks.successRate}%` : wLoading ? '…' : '—'}
          icon={<ZapIcon className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-600"
        />
      </div>

      {/* ── Dunning recovery trend ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Daily Revenue Recovered</h2>
        <p className="mb-4 text-xs text-gray-400">Last {days} days — failed payments successfully collected</p>
        {dLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : dunning && dunning.dailyRecoveries.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dunning.dailyRecoveries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="recovGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(val: number) => [`$${(val / 100).toFixed(2)}`, 'Recovered']}
                labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#4f46e5"
                strokeWidth={2}
                fill="url(#recovGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            No recovered payments in this period
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Save Flow offer breakdown ──────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Save Offer Acceptance</h2>
          <p className="mb-4 text-xs text-gray-400">Last 30 days — acceptance rate per offer type</p>
          {sLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : saveFlow && saveFlow.byOffer.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={saveFlow.byOffer} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="type"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, 'Acceptance Rate']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="acceptanceRate" radius={[4, 4, 0, 0]}>
                  {saveFlow.byOffer.map((entry) => (
                    <Cell
                      key={entry.offerId}
                      fill={OFFER_COLORS[entry.type] ?? '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              No cancellation attempts yet
            </div>
          )}
          {saveFlow && saveFlow.byOffer.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {saveFlow.byOffer.map((o) => (
                <div key={o.offerId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: OFFER_COLORS[o.type] ?? '#6366f1' }}
                    />
                    <span className="text-gray-600">{o.type}</span>
                  </div>
                  <span className="font-medium text-gray-900">
                    {o.saved}/{o.attempts} ({o.acceptanceRate}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Failure reasons ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Top Failure Reasons</h2>
          <p className="mb-4 text-xs text-gray-400">Most common reasons for payment failures</p>
          {dLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : dunning && dunning.topFailureReasons.length > 0 ? (
            <div className="space-y-3">
              {dunning.topFailureReasons.map((r, i) => {
                const maxCount = dunning.topFailureReasons[0].count;
                const pct = Math.round((r.count / maxCount) * 100);
                return (
                  <div key={i}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="max-w-[200px] truncate text-gray-700">{r.reason}</span>
                      <span className="font-medium text-gray-900">{r.count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-brand-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              No failure reason data yet
            </div>
          )}
        </div>
      </div>

      {/* ── Webhook health breakdown ───────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Webhook Health (Last 7 Days)</h2>
        <p className="mb-4 text-xs text-gray-400">Auto-retry keeps PROCESSING events until all attempts are exhausted</p>
        {wLoading ? (
          <div className="flex h-20 items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : webhooks ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Total', value: webhooks.total, color: 'text-gray-900' },
              { label: 'Processed', value: webhooks.processed, color: 'text-emerald-600' },
              { label: 'Retrying', value: webhooks.processing, color: 'text-amber-500' },
              { label: 'Failed', value: webhooks.failed, color: 'text-red-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3 text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="mt-0.5 text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
