import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { demoApi } from '../api/demo';
import { DemoBanner, DemoModuleNav } from './demo/DemoShared';
import DemoDunning from './demo/DemoDunning';
import DemoWebhooks from './demo/DemoWebhooks';
import DemoInvoices from './demo/DemoInvoices';
import DemoSaveFlow from './demo/DemoSaveFlow';
import DemoAccounting from './demo/DemoAccounting';
import DemoDisputes from './demo/DemoDisputes';

type Module = 'dunning' | 'webhooks' | 'invoices' | 'saveflow' | 'accounting' | 'disputes';

function ModuleContent({ module }: { module: Module }) {
  switch (module) {
    case 'dunning':
      return <DemoDunning />;
    case 'webhooks':
      return <DemoWebhooks />;
    case 'invoices':
      return <DemoInvoices />;
    case 'saveflow':
      return <DemoSaveFlow />;
    case 'accounting':
      return <DemoAccounting />;
    case 'disputes':
      return <DemoDisputes />;
  }
}

export default function DemoPage() {
  const [activeModule, setActiveModule] = useState<Module>('dunning');
  const [authError, setAuthError] = useState('');
  const [authed, setAuthed] = useState(false);

  // Auto-login as demo user on mount
  useEffect(() => {
    const existing = localStorage.getItem('accessToken');
    if (existing) {
      setAuthed(true);
      return;
    }
    authApi
      .login('demo@acmecoffee.com', 'DemoPass123!')
      .then((data) => {
        localStorage.setItem('accessToken', data.accessToken);
        setAuthed(true);
      })
      .catch(() => {
        setAuthError(
          'Demo unavailable — seed the database first (npm run prisma:seed)',
        );
      });
  }, []);

  const resetDemo = useMutation({
    mutationFn: demoApi.resetDemo,
  });

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="mb-2 text-lg font-semibold text-gray-900">
            Demo Unavailable
          </h1>
          <p className="text-sm text-gray-600">{authError}</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-sm">Loading demo…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Banner */}
      <DemoBanner onReset={() => resetDemo.mutate()} />

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            M
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Marginly — Interactive Demo
          </h1>
        </div>
      </div>

      {/* Module nav */}
      <DemoModuleNav
        active={activeModule}
        onChange={(m) => setActiveModule(m as Module)}
      />

      {/* Main content */}
      <main className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <ModuleContent module={activeModule} />
        </div>
      </main>
    </div>
  );
}
