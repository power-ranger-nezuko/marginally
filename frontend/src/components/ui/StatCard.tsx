import type { ReactNode } from 'react';
import { TrendingUpIcon, TrendingDownIcon } from './Icons';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  prefix?: string;
  suffix?: string;
  accent?: string;
}

export default function StatCard({ label, value, icon, trend, prefix, suffix, accent = 'bg-brand-50 text-brand-600' }: StatCardProps) {
  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            {prefix}
            {value}
            {suffix}
          </p>
          {trend !== undefined && (
            <div
              className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
                trend >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {trend >= 0 ? (
                <TrendingUpIcon className="h-3.5 w-3.5" />
              ) : (
                <TrendingDownIcon className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend)}% vs last month
            </div>
          )}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
