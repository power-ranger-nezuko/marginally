import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/accounting', () => ({
  accountingApi: {
    listConnections: vi.fn().mockResolvedValue([
      { provider: 'quickbooks', connected: true, lastSyncAt: '2024-06-01T00:00:00Z' },
      { provider: 'xero', connected: false, lastSyncAt: null },
    ]),
    getSyncStatus: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getReconciliationReport: vi.fn().mockResolvedValue({
      totalTransactions: 50,
      synced: 45,
      pending: 3,
      failed: 2,
    }),
    triggerSync: vi.fn().mockResolvedValue({}),
    disconnectAccounting: vi.fn().mockResolvedValue({}),
  },
}));

import AccountingPage from '../AccountingPage';
import { accountingApi } from '../../api/accounting';

// Intercept window.location.href assignments made by handleOAuth
let lastHref = '';
Object.defineProperty(window, 'location', {
  value: {
    get href() { return lastHref; },
    set href(v) { lastHref = v; },
  },
  writable: true,
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AccountingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastHref = '';
  });

  it('renders page title and Trigger Sync button', () => {
    renderWithQuery(<AccountingPage />);
    expect(screen.getByText('Accounting')).toBeDefined();
    expect(screen.getByRole('button', { name: /trigger sync/i })).toBeDefined();
  });

  it('calls triggerSync when Trigger Sync button is clicked', async () => {
    renderWithQuery(<AccountingPage />);
    await userEvent.click(screen.getByRole('button', { name: /trigger sync/i }));
    await waitFor(() => {
      expect(accountingApi.triggerSync).toHaveBeenCalledTimes(1);
    });
  });

  it('disables Trigger Sync button while mutation is pending', async () => {
    vi.mocked(accountingApi.triggerSync).mockImplementation(() => new Promise(() => {}));
    renderWithQuery(<AccountingPage />);
    await userEvent.click(screen.getByRole('button', { name: /trigger sync/i }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /syncing/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows QuickBooks connection as Connected', async () => {
    renderWithQuery(<AccountingPage />);
    await waitFor(() => {
      expect(screen.getByText('QuickBooks')).toBeDefined();
    });
    // Connected — shows Disconnect button
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeDefined();
  });

  it('shows Xero as Disconnected with Connect Xero button', async () => {
    renderWithQuery(<AccountingPage />);
    // "Xero" appears in both the ProviderIcon <span> and the label <p>
    await waitFor(() => {
      expect(screen.getAllByText('Xero').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /connect xero/i })).toBeDefined();
  });

  it('navigates via window.location.href when Connect Xero is clicked', async () => {
    renderWithQuery(<AccountingPage />);
    await waitFor(() => screen.getByRole('button', { name: /connect xero/i }));
    await userEvent.click(screen.getByRole('button', { name: /connect xero/i }));
    expect(lastHref).toBe('/api/v1/accounting/oauth/xero');
  });

  it('calls disconnectAccounting when Disconnect is clicked', async () => {
    renderWithQuery(<AccountingPage />);
    await waitFor(() => screen.getByRole('button', { name: /disconnect/i }));
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => {
      expect(accountingApi.disconnectAccounting).toHaveBeenCalledWith('quickbooks', expect.anything());
    });
  });

  it('shows reconciliation report with correct counts', async () => {
    renderWithQuery(<AccountingPage />);
    await waitFor(() => {
      expect(screen.getByText('Reconciliation Report')).toBeDefined();
      expect(screen.getByText('50')).toBeDefined();
      expect(screen.getByText('45')).toBeDefined();
    });
  });

  it('shows empty sync message when no sync entries exist', async () => {
    renderWithQuery(<AccountingPage />);
    await waitFor(() => {
      expect(screen.getByText('No sync entries yet.')).toBeDefined();
    });
  });
});
