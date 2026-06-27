import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/saveflow', () => ({
  saveflowApi: {
    getStats: vi.fn().mockResolvedValue({
      savedCount: 12,
      churnedCount: 3,
      saveRate: 80.0,
      savedMrr: 120000,
    }),
    listOffers: vi.fn().mockResolvedValue([]),
    listAttempts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    createOffer: vi.fn().mockResolvedValue({ id: 'offer-new' }),
  },
}));

import SaveFlowPage from '../SaveFlowPage';
import { saveflowApi } from '../../api/saveflow';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SaveFlowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and all stat card labels', () => {
    renderWithQuery(<SaveFlowPage />);
    expect(screen.getByText('Save Flow')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();
    expect(screen.getByText('Churned')).toBeDefined();
    expect(screen.getByText('Save Rate')).toBeDefined();
    expect(screen.getByText('Saved MRR')).toBeDefined();
  });

  it('displays stats fetched from the API', async () => {
    renderWithQuery(<SaveFlowPage />);
    await waitFor(() => {
      expect(screen.getByText('12')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
      expect(screen.getByText('80.0%')).toBeDefined();
      expect(screen.getByText('$1,200.00')).toBeDefined();
    });
  });

  it('opens New Offer dialog when + New Offer is clicked', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => {
      expect(screen.getByText('Create Save Offer')).toBeDefined();
    });
  });

  it('shows Discount % field for DISCOUNT offer type (default)', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => screen.getByText('Create Save Offer'));
    expect(screen.getByText('Discount %')).toBeDefined();
  });

  it('shows Pause Duration field when PAUSE is selected', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => screen.getByText('Create Save Offer'));

    await userEvent.selectOptions(screen.getByDisplayValue('Discount'), 'PAUSE');
    expect(screen.getByText('Pause Duration (days)')).toBeDefined();
  });

  it('shows Target Plan field when DOWNGRADE is selected', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => screen.getByText('Create Save Offer'));

    await userEvent.selectOptions(screen.getByDisplayValue('Discount'), 'DOWNGRADE');
    expect(screen.getByText('Target Plan')).toBeDefined();
  });

  it('calls createOffer when form is submitted', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => screen.getByText('Create Save Offer'));

    await userEvent.type(screen.getByPlaceholderText('e.g. 20'), '25');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(saveflowApi.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DISCOUNT' }),
      );
    });
  });

  it('closes dialog when Cancel is clicked', async () => {
    renderWithQuery(<SaveFlowPage />);
    await userEvent.click(screen.getByRole('button', { name: /new offer/i }));
    await waitFor(() => screen.getByText('Create Save Offer'));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText('Create Save Offer')).toBeNull();
    });
  });

  it('shows empty table message when no attempts exist', async () => {
    renderWithQuery(<SaveFlowPage />);
    await waitFor(() => {
      expect(screen.getByText('No save attempts yet.')).toBeDefined();
    });
  });
});
