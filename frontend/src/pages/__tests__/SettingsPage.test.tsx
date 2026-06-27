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

import SettingsPage from '../SettingsPage';
import { connectionsApi } from '../../api/connections';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeDefined();
  });

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

  it('shows Connect Shopify button for disconnected provider', async () => {
    renderWithQuery(<SettingsPage />);
    await waitFor(() => screen.getByText('Connect Shopify'));
    const link = screen.getByText('Connect Shopify');
    expect(link).toBeDefined();
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

    // The confirm button is inside the dialog — it's the last Disconnect button
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

  it('renders subscription plan section with all three plans', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Subscription Plan')).toBeDefined();
    expect(screen.getByText('Starter')).toBeDefined();
    expect(screen.getByText('Growth')).toBeDefined();
    expect(screen.getByText('Suite')).toBeDefined();
  });

  it('shows Current badge on the active plan (GROWTH)', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Current')).toBeDefined();
  });

  it('shows Upgrade links for non-current plans', () => {
    renderWithQuery(<SettingsPage />);
    expect(screen.getByText('Upgrade to Starter')).toBeDefined();
    expect(screen.getByText('Upgrade to Suite')).toBeDefined();
  });

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
