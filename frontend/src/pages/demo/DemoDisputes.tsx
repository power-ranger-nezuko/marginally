import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { disputesApi, Dispute } from '../../api/disputes';
import { demoApi } from '../../api/demo';
import StatCard from '../../components/ui/StatCard';
import DataTable, { ColumnDef } from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { SimulateButton } from './DemoShared';
import { ScaleIcon, SearchIcon, CheckCircleIcon, TrendingUpIcon } from '../../components/ui/Icons';

const WIN_RATE_TREND = [
  { month: 'Jan', rate: 33 },
  { month: 'Feb', rate: 40 },
  { month: 'Mar', rate: 45 },
  { month: 'Apr', rate: 50 },
  { month: 'May', rate: 55 },
  { month: 'Jun', rate: 67 },
];

function CountdownTimer({ dueDate }: { dueDate?: string }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('text-gray-500');
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!dueDate) {
      setLabel('—');
      return;
    }
    const update = () => {
      const diff = new Date(dueDate).getTime() - Date.now();
      if (diff <= 0) {
        setLabel('Overdue');
        setColor('text-red-600 font-bold');
        return;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      if (days < 1) {
        setLabel(`${hours}h left`);
        setColor('text-red-500 font-semibold');
      } else if (days < 3) {
        setLabel(`${days}d ${hours}h left`);
        setColor('text-orange-500 font-semibold');
      } else {
        setLabel(`${days} days left`);
        setColor('text-gray-600');
      }
    };
    update();
    ref.current = setInterval(update, 60_000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [dueDate]);

  return <span className={`text-xs ${color}`}>{label}</span>;
}

export default function DemoDisputes() {
  const qc = useQueryClient();
  const [winRate, setWinRate] = useState(50);

  const { data: disputesData, isLoading } = useQuery({
    queryKey: ['disputes', {}],
    queryFn: () => disputesApi.listDisputes({}),
  });

  const { data: stats } = useQuery({
    queryKey: ['dispute-stats'],
    queryFn: disputesApi.getStats,
  });

  const simulateWin = useMutation({
    mutationFn: () => demoApi.simulate('dispute-won'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['disputes'] });
      void qc.invalidateQueries({ queryKey: ['dispute-stats'] });
      setWinRate(67);
    },
  });

  const underReview = disputesData?.data.find(
    (d) => d.status === 'UNDER_REVIEW',
  );

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
        `$${(r.amount / 100).toFixed(2)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'due',
      header: 'Evidence Due',
      render: (r) => <CountdownTimer dueDate={r.evidenceDueBy} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Open" value={stats?.open ?? 1} icon={<ScaleIcon className="h-5 w-5" />} accent="bg-orange-50 text-orange-600" />
        <StatCard label="Under Review" value={1} icon={<SearchIcon className="h-5 w-5" />} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Won" value={stats?.wonCount ?? 1} icon={<CheckCircleIcon className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          icon={<TrendingUpIcon className="h-5 w-5" />}
          accent="bg-violet-50 text-violet-600"
          trend={winRate > 50 ? 1 : -1}
        />
      </div>

      {/* Disputes table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-semibold text-gray-900">Disputes</h3>
        </div>
        <DataTable
          columns={COLUMNS}
          data={disputesData?.data ?? []}
          isLoading={isLoading}
          keyExtractor={(r) => r.id}
          emptyMessage="No disputes."
        />
      </div>

      {/* Evidence detail panel */}
      {underReview && underReview.evidenceBundle && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h3 className="mb-3 text-sm font-semibold text-blue-900">
            Evidence Bundle — Under Review
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {underReview.evidenceBundle.orderData && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Order Data
                </p>
                <pre className="overflow-auto rounded bg-white p-3 text-xs text-gray-700">
                  {underReview.evidenceBundle.orderData}
                </pre>
              </div>
            )}
            {underReview.evidenceBundle.shippingData && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Shipping Data
                </p>
                <pre className="overflow-auto rounded bg-white p-3 text-xs text-gray-700">
                  {underReview.evidenceBundle.shippingData}
                </pre>
              </div>
            )}
            {underReview.evidenceBundle.commsLog && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Communications Log
                </p>
                <pre className="overflow-auto rounded bg-white p-3 text-xs text-gray-700">
                  {underReview.evidenceBundle.commsLog}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulate button */}
      <div className="flex gap-3">
        <SimulateButton
          label="Simulate: Win This Dispute"
          onClick={() => simulateWin.mutate()}
          loading={simulateWin.isPending}
        />
      </div>

      {/* Win rate trend chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Win Rate Trend (6 months)
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={WIN_RATE_TREND}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Win Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
