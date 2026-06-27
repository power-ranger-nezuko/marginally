import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { tenantsApi } from '../../api/tenants';
import {
  LayoutDashboardIcon,
  RefreshIcon,
  BellIcon,
  ReceiptIcon,
  HeartHandshakeIcon,
  BookOpenIcon,
  ScaleIcon,
  SettingsIcon,
  LogOutIcon,
  BarChart2Icon,
} from '../ui/Icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', Icon: LayoutDashboardIcon, end: true },
  { to: '/dashboard/dunning', label: 'Dunning', Icon: RefreshIcon },
  { to: '/dashboard/webhooks', label: 'Webhooks', Icon: BellIcon },
  { to: '/dashboard/invoices', label: 'Invoices', Icon: ReceiptIcon },
  { to: '/dashboard/save-flow', label: 'Save Flow', Icon: HeartHandshakeIcon },
  { to: '/dashboard/accounting', label: 'Accounting', Icon: BookOpenIcon },
  { to: '/dashboard/disputes', label: 'Disputes', Icon: ScaleIcon },
  { to: '/dashboard/reporting', label: 'Reporting', Icon: BarChart2Icon },
  { to: '/dashboard/settings', label: 'Settings', Icon: SettingsIcon },
];

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  STARTER: 'bg-sky-50 text-sky-700',
  GROWTH: 'bg-violet-50 text-violet-700',
  ENTERPRISE: 'bg-amber-50 text-amber-700',
};

function MarginlyLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path
        d="M8 22V10l8 6 8-6v12"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserAvatar({ email }: { email?: string }) {
  const initials = email ? email[0].toUpperCase() : '?';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {initials}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: tenantsApi.getTenant,
  });

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <MarginlyLogo />
        <span className="text-[15px] font-semibold tracking-tight text-gray-900">Marginly</span>
      </div>

      {/* Plan badge */}
      {tenant && (
        <div className="px-5 pb-3">
          <span
            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
              PLAN_COLORS[tenant.plan] ?? PLAN_COLORS['FREE']
            }`}
          >
            {tenant.plan}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 pt-1">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600'
                  }`}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <UserAvatar email={user?.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <LogOutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
