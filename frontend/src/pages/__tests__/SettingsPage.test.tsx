import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/connections', () => ({
  connectionsApi: {
    listConnections: vi.fn().mockResolvedValue([
      { provider: 'stripe', connected: true, connectedAt: '2024-01-01T00:00:00Z' },
      { provider: 'shopify', connected: false, connectedAt: null },
    ]),
    disconnectConnection: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../api/audit', () => ({
  auditApi: {
    getRecentLogs: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));

vi.mock('../../api/tenants', () => ({
  tenantsApi: {
    getTenant: vi.fn().mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      plan: 'GROWTH',
      stripeConnected: true,
      shopifyConnected: false,
    }),
    updatePlan: vi.fn().mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      plan: 'SUITE',
      stripeConnected: true,
      shopifyConnected: false,
    }),
  },
}));

import SettingsPage from '../SettingsPage';
import { connectionsApi } from '../../api/connections';
import { tenantsApi } from '../../api/tenants';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantsApi.getTenant).mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      plan: 'GROWTH',
      stripeConnected: true,
      shopifyConnected: false,
    });
    vi.mocked(tenantsApi.updatePlan).mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      plan: 'SUITE',
      stripeConnected: true,
      shopifyConnected: false,
    });
  });

  it('renders page title', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeDefined();
  });

  // ── Platform Connections ─────────────────────────────────────────────────────

  it('shows platform connections section with provider names', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeDefined();
      expect(screen.getByText('Shopify')).toBeDefined();
    });
  });

  it('shows Disconnect button for connected Stripe', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByText('Stripe'));
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeDefined();
  });

  it('shows Connect Shopify link for disconnected provider', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByText('Connect Shopify'));
    expect(screen.getByText('Connect Shopify')).toBeDefined();
  });

  it('opens confirm dialog when Disconnect is clicked', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /disconnect/i }));
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => {
      expect(screen.getByText(/disconnect stripe\?/i)).toBeDefined();
    });
  });

  it('shows warning message in confirm dialog', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /disconnect/i }));
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => {
      expect(screen.getByText(/stop syncing data from this provider/i)).toBeDefined();
    });
  });

  it('calls disconnectConnection when confirm dialog Disconnect is clicked', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /disconnect/i }));
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => screen.getByText(/disconnect stripe\?/i));

    const allDisconnectBtns = screen.getAllByRole('button', { name: /disconnect/i });
    await userEvent.click(allDisconnectBtns[allDisconnectBtns.length - 1]);

    await waitFor(() => {
      expect(connectionsApi.disconnectConnection).toHaveBeenCalledWith('stripe');
    });
  });

  it('closes dialog when Cancel is clicked', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /disconnect/i }));
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => screen.getByText(/disconnect stripe\?/i));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText(/disconnect stripe\?/i)).toBeNull();
    });
  });

  // ── Subscription Plan ────────────────────────────────────────────────────────

  it('renders all three plan cards', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Subscription Plan')).toBeDefined();
    expect(screen.getByText('Starter')).toBeDefined();
    expect(screen.getByText('Growth')).toBeDefined();
    expect(screen.getByText('Suite')).toBeDefined();
  });

  it('fetches current plan from API and shows Current badge on GROWTH', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => {
      expect(tenantsApi.getTenant).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Current')).toBeDefined();
      // GROWTH is current so Upgrade to Growth must not appear
      expect(screen.queryByRole('button', { name: /upgrade to growth/i })).toBeNull();
    });
  });

  it('shows Current badge on STARTER when API returns STARTER plan', async () => {
    vi.mocked(tenantsApi.getTenant).mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      plan: 'STARTER',
      stripeConnected: false,
      shopifyConnected: false,
    });
    renderWithQuery(<SettingsPage />);
    await waitFor(() => expect(tenantsApi.getTenant).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /upgrade to starter/i })).toBeNull();
      expect(screen.getByRole('button', { name: /upgrade to growth/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /upgrade to suite/i })).toBeDefined();
    });
  });

  it('shows upgrade buttons for non-current plans when on GROWTH', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => expect(tenantsApi.getTenant).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to starter/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /upgrade to suite/i })).toBeDefined();
    });
  });

  it('calls tenantsApi.updatePlan when an upgrade button is clicked', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /upgrade to suite/i }));
    await userEvent.click(screen.getByRole('button', { name: /upgrade to suite/i }));
    await waitFor(() => {
      expect(tenantsApi.updatePlan).toHaveBeenCalledWith('SUITE');
    });
  });

  it('disables upgrade buttons while mutation is pending', async () => {
    vi.mocked(tenantsApi.updatePlan).mockImplementation(() => new Promise(() => {}));
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /upgrade to suite/i }));
    await userEvent.click(screen.getByRole('button', { name: /upgrade to suite/i }));
    await waitFor(() => {
      // All non-current plan buttons switch to "Updating…" while pending
      const btns = screen.getAllByRole('button', { name: /updating/i });
      expect(btns.length).toBeGreaterThan(0);
      expect(btns.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });
  });

  it('shows success toast after plan upgrade', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /upgrade to suite/i }));
    await userEvent.click(screen.getByRole('button', { name: /upgrade to suite/i }));
    await waitFor(() => {
      expect(screen.getByText(/plan updated to suite/i)).toBeDefined();
    });
  });

  it('shows error toast when plan update fails', async () => {
    vi.mocked(tenantsApi.updatePlan).mockRejectedValue(new Error('Server error'));
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: /upgrade to suite/i }));
    await userEvent.click(screen.getByRole('button', { name: /upgrade to suite/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to update plan/i)).toBeDefined();
    });
  });

  // ── Audit Log ───────────────────────────────────────────────────────────────

  it('renders recent audit log section', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Recent Audit Log')).toBeDefined();
  });

  it('shows empty audit log message when no logs', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('No audit events yet.')).toBeDefined();
    });
  });
});
