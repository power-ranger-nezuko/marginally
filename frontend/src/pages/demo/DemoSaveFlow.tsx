import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import * as Dialog from '@radix-ui/react-dialog';
import * as Toast from '@radix-ui/react-toast';
import { saveflowApi } from '../../api/saveflow';
import StatCard from '../../components/ui/StatCard';
import { HeartHandshakeIcon, TrendingDownIcon, ZapIcon } from '../../components/ui/Icons';

const WEEKLY_DATA = [
  { week: 'W1', saved: 4, churned: 6 },
  { week: 'W2', saved: 6, churned: 5 },
  { week: 'W3', saved: 5, churned: 4 },
  { week: 'W4', saved: 8, churned: 3 },
  { week: 'W5', saved: 7, churned: 4 },
  { week: 'W6', saved: 9, churned: 3 },
  { week: 'W7', saved: 10, churned: 2 },
];

function WidgetPreview() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [churnedCount, setChurnedCount] = useState(0);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState('bg-green-700');

  const handleAccept = () => {
    setSavedCount((n) => n + 1);
    setDialogOpen(false);
    setToastColor('bg-green-700');
    setToastMsg('Subscription saved! Enjoy 20% off for 3 months.');
    setToastOpen(true);
  };

  const handleCancel = () => {
    setChurnedCount((n) => n + 1);
    setDialogOpen(false);
    setToastColor('bg-gray-600');
    setToastMsg('Subscription cancelled.');
    setToastOpen(true);
  };

  return (
    <Toast.Provider>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Widget Preview
        </h3>
        {/* Mock subscription page */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Pro Plan</p>
              <p className="text-sm text-gray-500">$49/month · renews Jul 1</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              Active
            </span>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Cancel Subscription
          </button>
          {(savedCount > 0 || churnedCount > 0) && (
            <div className="mt-3 flex gap-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <span>
                Saved:{' '}
                <strong className="text-green-600">{savedCount}</strong>
              </span>
              <span>
                Churned:{' '}
                <strong className="text-red-600">{churnedCount}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Save flow dialog */}
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-1 text-2xl">😢</div>
              <Dialog.Title className="mb-2 text-lg font-semibold text-gray-900">
                Before you go…
              </Dialog.Title>
              <p className="mb-5 text-sm text-gray-600">
                Get 20% off for 3 months — keep your subscription?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAccept}
                  className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Accept Offer
                </button>
                <button
                  onClick={handleCancel}
                  className="w-full rounded-lg border py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel Anyway
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Toast.Root
          open={toastOpen}
          onOpenChange={setToastOpen}
          className={`fixed bottom-6 right-6 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toastColor}`}
        >
          <Toast.Title>{toastMsg}</Toast.Title>
        </Toast.Root>
        <Toast.Viewport />
      </div>
    </Toast.Provider>
  );
}

export default function DemoSaveFlow() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['saveflow', 'stats'],
    queryFn: saveflowApi.getStats,
  });

  const saveRate = stats
    ? stats.saveRate.toFixed(1)
    : '62.5';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: widget preview */}
      <WidgetPreview />

      {/* Right: stats + chart */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Saved"
            value={stats ? stats.savedCount : isLoading ? '…' : 47}
            icon={<HeartHandshakeIcon className="h-5 w-5" />}
            accent="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Churned"
            value={stats ? stats.churnedCount : isLoading ? '…' : 29}
            icon={<TrendingDownIcon className="h-5 w-5" />}
            accent="bg-red-50 text-red-500"
          />
          <StatCard
            label="Save Rate"
            value={`${saveRate}%`}
            icon={<ZapIcon className="h-5 w-5" />}
            accent="bg-brand-50 text-brand-600"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Saved vs Churned (7 weeks)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WEEKLY_DATA}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="saved" fill="#22c55e" name="Saved" />
                <Bar dataKey="churned" fill="#ef4444" name="Churned" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
