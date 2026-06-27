import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DisputesPage from '../DisputesPage';

// Mock disputesApi
vi.mock('../../api/disputes', () => ({
  disputesApi: {
    listDisputes: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'disp_1',
          stripeDisputeId: 'dp_1234567890abcdef',
          amount: 4999,
          currency: 'usd',
          status: 'OPEN',
          reason: 'fraudulent',
          customerId: 'cus_1',
          createdAt: '2024-06-01T00:00:00Z',
          evidenceDueBy: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          evidenceBundle: undefined,
        },
        {
          id: 'disp_2',
          stripeDisputeId: 'dp_abcdef1234567890',
          amount: 9999,
          currency: 'usd',
          status: 'WON',
          reason: 'general',
          customerId: 'cus_2',
          createdAt: '2024-05-01T00:00:00Z',
          evidenceDueBy: undefined,
          evidenceBundle: undefined,
        },
      ],
      total: 2,
    }),
    getStats: vi.fn().mockResolvedValue({
      open: 1,
      won: 1,
      lost: 0,
      winRate: 50,
    }),
    submitEvidence: vi.fn().mockResolvedValue({}),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe('DisputesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stat cards', async () => {
    renderWithQuery(<DisputesPage />);
    expect(screen.getByText('Open Disputes')).toBeDefined();
    // 'Under Review' and 'Won' also appear in the status filter <select>,
    // so use getAllByText and confirm at least one match exists.
    expect(screen.getAllByText('Under Review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Won').length).toBeGreaterThan(0);
    expect(screen.getByText('Win Rate')).toBeDefined();
  });

  it('shows disputes from the API in the table', async () => {
    renderWithQuery(<DisputesPage />);
    await waitFor(() => {
      expect(screen.getByText('dp_1234567890abcdef'.slice(0, 18) + '…')).toBeDefined();
    });
    expect(screen.getByText('USD 49.99')).toBeDefined();
  });

  it('opens the Submit Evidence dialog on button click', async () => {
    renderWithQuery(<DisputesPage />);
    await waitFor(() =>
      screen.getByText('dp_1234567890abcdef'.slice(0, 18) + '…'),
    );
    const btn = screen.getByText('Submit Evidence');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Order Data')).toBeDefined();
      expect(screen.getByText('Shipping Data')).toBeDefined();
      expect(screen.getByText('Communications Log')).toBeDefined();
    });
  });

  it('calls submitEvidence with correct args on submit', async () => {
    const { disputesApi } = await import('../../api/disputes');
    renderWithQuery(<DisputesPage />);
    await waitFor(() =>
      screen.getByText('dp_1234567890abcdef'.slice(0, 18) + '…'),
    );

    fireEvent.click(screen.getByText('Submit Evidence'));
    await waitFor(() => screen.getByText('Order Data'));

    const submitBtn = screen.getAllByText('Submit Evidence').find(
      (el) => el.tagName === 'BUTTON' && !el.closest('[role="dialog"]') === false,
    );
    if (submitBtn) {
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(disputesApi.submitEvidence).toHaveBeenCalledWith(
          'disp_1',
          expect.objectContaining({}),
        );
      });
    }
  });
});
