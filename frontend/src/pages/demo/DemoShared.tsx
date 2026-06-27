import type { } from 'react';

const MODULES = [
  { key: 'dunning', label: 'Dunning' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'saveflow', label: 'Save Flow' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'disputes', label: 'Disputes' },
];

export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex items-center justify-between bg-yellow-400 px-6 py-2 text-sm font-medium text-yellow-900">
      <span>
        👀 Interactive Demo — no signup needed · data resets hourly
      </span>
      <button
        onClick={onReset}
        className="rounded-lg border border-yellow-600 bg-yellow-500 px-3 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-600"
      >
        Reset Demo
      </button>
    </div>
  );
}

export function SimulateButton({
  label,
  onClick,
  loading,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-brand-500 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      ) : (
        <span>▶</span>
      )}
      {label}
    </button>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Live
    </span>
  );
}

export function DemoModuleNav({
  active,
  onChange,
}: {
  active: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 bg-white px-6">
      {MODULES.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            active === m.key
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
