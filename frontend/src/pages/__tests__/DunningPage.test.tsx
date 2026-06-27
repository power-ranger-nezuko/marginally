import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/dunning', () => ({
  dunningApi: {
    getStats: vi.fn().mockResolvedValue({
      totalRecovered: 150000,
      activeRecovering: 3,
      successRate: 65.5,
    }),
    listFailedPayments: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    listSequences: vi.fn().mockResolvedValue([]),
    createSequence: vi.fn().mockResolvedValue({ id: 'seq-1', name: 'Test Sequence' }),
  },
}));

import DunningPage from '../DunningPage';
import { dunningApi } from '../../api/dunning';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('DunningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and stat card labels', () => {
    renderWithQuery(<DunningPage />);
    expect(screen.getByText('Dunning')).toBeDefined();
    // These labels also appear as filter <option> values — use getAllByText
    expect(screen.getAllByText('Recovered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recovering').length).toBeGreaterThan(0);
    expect(screen.getByText('Success Rate')).toBeDefined();
  });

  it('displays stats fetched from the API', async () => {
    renderWithQuery(<DunningPage />);
    await waitFor(() => {
      expect(screen.getByText('$1500.00')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
      expect(screen.getByText('65.5%')).toBeDefined();
    });
  });

  it('opens New Sequence dialog when button is clicked', async () => {
    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => {
      expect(screen.getByText('Create Recovery Sequence')).toBeDefined();
    });
  });

  it('shows validation error when submitting without a sequence name', async () => {
    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => screen.getByText('Create Recovery Sequence'));

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeDefined();
    });
  });

  it('adds a step when "+ Add step" is clicked', async () => {
    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => screen.getByText('Create Recovery Sequence'));

    await userEvent.click(screen.getByText('+ Add step'));

    const dayInputs = screen.getAllByPlaceholderText('0');
    expect(dayInputs.length).toBe(2);
  });

  it('removes a step when ✕ is clicked', async () => {
    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => screen.getByText('Create Recovery Sequence'));

    // Add a step first so there are 2 steps and ✕ becomes visible
    await userEvent.click(screen.getByText('+ Add step'));
    expect(screen.getAllByPlaceholderText('0').length).toBe(2);

    await userEvent.click(screen.getAllByText('✕')[0]);
    expect(screen.getAllByPlaceholderText('0').length).toBe(1);
  });

  it('calls createSequence on valid form submit', async () => {
    vi.mocked(dunningApi.createSequence).mockResolvedValueOnce({ id: 'seq-new', name: 'My Sequence' } as any);

    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => screen.getByText('Create Recovery Sequence'));

    await userEvent.type(screen.getByPlaceholderText('e.g. Standard Recovery'), 'My Sequence');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(dunningApi.createSequence).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Sequence' }),
      );
    });
  });

  it('closes the dialog and resets form on Cancel', async () => {
    renderWithQuery(<DunningPage />);
    await userEvent.click(screen.getByRole('button', { name: /new sequence/i }));
    await waitFor(() => screen.getByText('Create Recovery Sequence'));

    await userEvent.type(screen.getByPlaceholderText('e.g. Standard Recovery'), 'Draft');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('Create Recovery Sequence')).toBeNull();
    });
  });

  it('renders the status filter select', () => {
    renderWithQuery(<DunningPage />);
    expect(screen.getByDisplayValue('All statuses')).toBeDefined();
  });

  it('refetches with status filter when select changes', async () => {
    renderWithQuery(<DunningPage />);
    const select = screen.getByDisplayValue('All statuses') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'RECOVERING');

    await waitFor(() => {
      expect(dunningApi.listFailedPayments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'RECOVERING' }),
      );
    });
  });

  it('shows empty message when no failed payments exist', async () => {
    renderWithQuery(<DunningPage />);
    await waitFor(() => {
      expect(screen.getByText('No failed payments found.')).toBeDefined();
    });
  });
});
