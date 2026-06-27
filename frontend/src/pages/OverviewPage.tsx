import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { dunningApi } from '../api/dunning';
import { saveflowApi } from '../api/saveflow';
import { disputesApi } from '../api/disputes';
import { webhooksApi } from '../api/webhooks';
import { connectionsApi } from '../api/connections';
import { reportingApi } from '../api/reporting';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import {
  DollarSignIcon,
  HeartHandshakeIcon,
  ScaleIcon,
  ActivityIcon,
} from '../components/ui/Icons';

// ── Setup checklist ───────────────────────────────────────────────────────────

interface CheckStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

function SetupChecklist({ steps }: { steps: CheckStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (allDone) return null;

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">Get started — {doneCount} of {steps.length} complete</h2>
          <p className="mt-0.5 text-xs text-brand-600">Complete these steps to start recovering revenue</p>
        </div>
        <div className="text-xs font-medium text-brand-700">{Math.round((doneCount / steps.length) * 100)}%</div>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-200">
        <div
          className="h-1.5 rounded-full bg-brand-600 transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
              step.done ? 'bg-white/50 opacity-60' : 'bg-white shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                step.done ? 'bg-emerald-500' : 'border-2 border-gray-300 bg-white'
              }`}>
                {step.done && (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {step.label}
                </p>
                {!step.done && <p className="text-xs text-gray-500">{step.description}</p>}
              </div>
            </div>
            {!step.done && (
              <Link
                to={step.href}
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                {step.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recovery trend chart ──────────────────────────────────────────────────────

function RecoveryChart() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['reporting', 'dunning', 7],
    queryFn: () => reportingApi.getDunningReport(7),
  });

  if (isLoading) {
    return (
      <div className="mt-6 h-56 animate-pulse rounded-xl bg-gray-100" />
    );
  }

  const hasData = report && report.dailyRecoveries.length > 0;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Revenue Recovered — Last 7 Days</p>
          <p className="mt-0.5 text-xs text-gray-400">Payments successfully collected after failure</p>
        </div>
        <Link to="/dashboard/reporting" className="text-xs font-medium text-brand-600 hover:underline">
          Full report →
        </Link>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={report.dailyRecoveries} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => new Date(d).toLocaleDateString('en', { weekday: 'short' })}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
              formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, 'Recovered']}
              labelFormatter={(l) => new Date(l as string).toLocaleDateString()}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#colorRecovered)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-44 flex-col items-center justify-center gap-2 text-center">
          <DollarSignIcon className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No recoveries yet</p>
          <p className="text-xs text-gray-400">Connect Stripe and failed payments will appear here automatically</p>
          <Link to="/dashboard/settings" className="mt-1 text-xs font-medium text-brand-600 hover:underline">
            Connect Stripe →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get('welcome') === '1';

  const { data: dunningStats } = useQuery({
    queryKey: ['dunning', 'stats'],
    queryFn: dunningApi.getStats,
  });

  const { data: saveStats } = useQuery({
    queryKey: ['saveflow', 'stats'],
    queryFn: saveflowApi.getStats,
  });

  const { data: disputeStats } = useQuery({
    queryKey: ['disputes', 'stats'],
    queryFn: disputesApi.getStats,
  });

  const { data: webhookEvents } = useQuery({
    queryKey: ['webhooks', 'events', { limit: 100 }],
    queryFn: () => webhooksApi.listEvents({ limit: 100 }),
  });

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: connectionsApi.listConnections,
  });

  const { data: sequences } = useQuery({
    queryKey: ['dunning', 'sequences'],
    queryFn: dunningApi.listSequences,
  });

  const { data: offers } = useQuery({
    queryKey: ['saveflow', 'offers'],
    queryFn: saveflowApi.listOffers,
  });

  const webhookHealth = webhookEvents
    ? Math.round(
        (webhookEvents.data.filter((e) => e.status === 'PROCESSED').length /
          (webhookEvents.total || 1)) * 100,
      )
    : null;

  const stripeConnected = connections?.some((c) => c.provider === 'stripe' && c.connected) ?? false;
  const hasSequence = (sequences?.length ?? 0) > 0;
  const hasOffer = (offers?.length ?? 0) > 0;

  const checklistSteps: CheckStep[] = [
    {
      id: 'stripe',
      label: 'Connect Stripe',
      description: 'Required for dunning, invoices, and dispute management',
      done: stripeConnected,
      href: '/dashboard/settings',
      cta: 'Connect →',
    },
    {
      id: 'sequence',
      label: 'Create a recovery sequence',
      description: 'Set up automated emails that go out when a payment fails',
      done: hasSequence,
      href: '/dashboard/dunning',
      cta: 'Set up →',
    },
    {
      id: 'offer',
      label: 'Create a save offer',
      description: 'Give customers a discount or pause instead of cancelling',
      done: hasOffer,
      href: '/dashboard/save-flow',
      cta: 'Create →',
    },
  ];

  const showChecklist = isWelcome || (!stripeConnected && !hasSequence && !hasOffer);

  return (
    <div>
      <PageHeader
        title={isWelcome ? '👋 Welcome to Marginly' : 'Overview'}
        subtitle={isWelcome ? "Let's get you set up — it takes less than 5 minutes" : 'Your merchant health at a glance'}
      />

      {showChecklist && <SetupChecklist steps={checklistSteps} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Recovered"
          value={
            dunningStats
              ? `$${(dunningStats.totalRecovered / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : '—'
          }
          icon={<DollarSignIcon className="h-5 w-5" />}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Saved MRR"
          value={
            saveStats
              ? `$${(saveStats.savedMrr / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : '—'
          }
          icon={<HeartHandshakeIcon className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Active Disputes"
          value={disputeStats?.open ?? '—'}
          icon={<ScaleIcon className="h-5 w-5" />}
          accent="bg-orange-50 text-orange-600"
        />
        <StatCard
          label="Webhook Health"
          value={webhookHealth !== null ? `${webhookHealth}%` : '—'}
          icon={<ActivityIcon className="h-5 w-5" />}
          accent="bg-sky-50 text-sky-600"
        />
      </div>

      <RecoveryChart />
    </div>
  );
}
