import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { dunningApi } from '../../api/dunning';
import { demoApi } from '../../api/demo';
import StatCard from '../../components/ui/StatCard';
import DataTable, { ColumnDef } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { SimulateButton, LiveBadge } from './DemoShared';
import { DollarSignIcon, RefreshIcon, TrendingUpIcon } from '../../components/ui/Icons';
import type { FailedPayment } from '../../api/dunning';

const SEQUENCE_STEPS = [
  { day: 'Day 0', label: 'Payment\nFails', icon: '✗' },
  { day: 'Day 1', label: 'Email\nSent', icon: '✉' },
  { day: 'Day 3', label: 'Email\nSent', icon: '✉' },
  { day: 'Day 7', label: 'SMS\nSent', icon: '💬' },
  { day: 'Day 14', label: 'Final\nEmail', icon: '✉' },
];

function RecoveryTimeline() {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">
        Recovery Sequence
      </h3>
      <div className="flex items-center overflow-x-auto">
        {SEQUENCE_STEPS.map((step, idx) => (
          <div key={step.day} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-brand-500 bg-brand-50 text-lg">
                {step.icon}
              </div>
              <p className="mt-1 text-xs font-semibold text-brand-600">
                {step.day}
              </p>
              <p className="whitespace-pre-line text-center text-xs text-gray-500">
                {step.label}
              </p>
            </div>
            {idx < SEQUENCE_STEPS.length - 1 && (
              <div className="mx-2 h-0.5 w-8 flex-shrink-0 bg-brand-300" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoiCalculator() {
  const [revenueAtRisk, setRevenueAtRisk] = useState(10000);
  const [recoveryRate, setRecoveryRate] = useState(40);

  const recovered = Math.round((revenueAtRisk * recoveryRate) / 100);

  const chartData = Array.from({ length: 12 }, (_, i) => ({
    month: `M${i + 1}`,
    recovered: Math.round(recovered * (1 + i * 0.02)),
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">ROI Calculator</h3>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Monthly Revenue at Risk:{' '}
            <span className="font-bold text-gray-900">
              ${revenueAtRisk.toLocaleString()}
            </span>
          </label>
          <input
            type="range"
            min={1000}
            max={50000}
            step={1000}
            value={revenueAtRisk}
            onChange={(e) => setRevenueAtRisk(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Recovery Rate:{' '}
            <span className="font-bold text-gray-900">{recoveryRate}%</span>
          </label>
          <input
            type="range"
            min={10}
            max={80}
            step={5}
            value={recoveryRate}
            onChange={(e) => setRecoveryRate(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
        </div>
      </div>
      <p className="mb-3 text-center text-sm font-medium text-gray-700">
        Est. monthly recovered:{' '}
        <span className="text-xl font-bold text-green-600">
          ${recovered.toLocaleString()}
        </span>
      </p>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="recovered"
              stroke="#2563eb"
              fill="#dbeafe"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function DemoDunning() {
  const qc = useQueryClient();
  const [_flashedId, setFlashedId] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['dunning', 'stats'],
    queryFn: dunningApi.getStats,
  });

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['dunning', 'payments', {}],
    queryFn: () => dunningApi.listFailedPayments({}),
  });

  const simulateFailure = useMutation({
    mutationFn: () => demoApi.simulate('failed-payment'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dunning', 'payments'] });
      const first = paymentsData?.data[0];
      if (first) {
        setFlashedId(first.id);
        setTimeout(() => setFlashedId(null), 1500);
      }
    },
  });

  const simulateRecovery = useMutation({
    mutationFn: () => demoApi.simulate('recovery-email'),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['dunning', 'payments'] }),
  });

  const COLUMNS: ColumnDef<FailedPayment>[] = [
    { key: 'stripeInvoiceId', header: 'Invoice ID', render: (r) => r.stripeInvoiceId },
    { key: 'customer', header: 'Customer', render: (r) => r.stripeCustomerId },
    {
      key: 'amount',
      header: 'Amount',
      render: (r) => `$${(r.amount / 100).toFixed(2)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    { key: 'retries', header: 'Retries', render: (r) => r.retryCount },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Recovered This Month"
          value={
            stats
              ? `$${(stats.totalRecovered / 100).toFixed(0)}`
              : '$677'
          }
          icon={<DollarSignIcon className="h-5 w-5" />}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard label="Active Recovering" value={3} icon={<RefreshIcon className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" />
        <StatCard label="Success Rate" value="67%" icon={<TrendingUpIcon className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" trend={5} />
      </div>

      {/* Recovery sequence timeline */}
      <RecoveryTimeline />

      {/* Failed payments table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between p-4">
          <h3 className="font-semibold text-gray-900">Failed Payments</h3>
          <LiveBadge />
        </div>
        <DataTable
          columns={COLUMNS}
          data={paymentsData?.data ?? []}
          isLoading={isLoading}
          keyExtractor={(r) => r.id}
          emptyMessage="No failed payments."
        />
      </div>

      {/* Simulate buttons */}
      <div className="flex flex-wrap gap-3">
        <SimulateButton
          label="Simulate New Failed Payment"
          onClick={() => simulateFailure.mutate()}
          loading={simulateFailure.isPending}
        />
        <SimulateButton
          label="Simulate Recovery Email Sent"
          onClick={() => simulateRecovery.mutate()}
          loading={simulateRecovery.isPending}
        />
      </div>

      {/* ROI calculator */}
      <RoiCalculator />
    </div>
  );
}
