import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/webhooks', () => ({
  webhooksApi: {
    listEvents: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'evt-1',
          provider: 'stripe',
          eventType: 'invoice.payment_failed',
          status: 'PROCESSED',
          receivedAt: '2024-06-01T00:00:00Z',
        },
      ],
      total: 1,
    }),
    listAlertRules: vi.fn().mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Failed payment alert',
        notificationChannel: 'email',
        notificationTarget: 'ops@example.com',
      },
    ]),
    replayEvent: vi.fn().mockResolvedValue({}),
    createAlertRule: vi.fn().mockResolvedValue({ id: 'rule-new' }),
    deleteAlertRule: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../api/reporting', () => ({
  reportingApi: {
    getWebhookStats: vi.fn().mockResolvedValue({
      total: 100,
      processed: 95,
      processing: 3,
      failed: 2,
    }),
  },
}));

import WebhooksPage from '../WebhooksPage';
import { webhooksApi } from '../../api/webhooks';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and filter controls', () => {
    renderWithQuery(<WebhooksPage />);
    expect(screen.getByText('Webhooks')).toBeDefined();
    expect(screen.getByText('All providers')).toBeDefined();
    expect(screen.getByText('All statuses')).toBeDefined();
    expect(screen.getByPlaceholderText('Search event type…')).toBeDefined();
  });

  it('displays events fetched from API', async () => {
    renderWithQuery(<WebhooksPage />);
    await waitFor(() => {
      expect(screen.getByText('invoice.payment_failed')).toBeDefined();
    });
  });

  it('displays webhook stats', async () => {
    renderWithQuery(<WebhooksPage />);
    await waitFor(() => {
      expect(screen.getByText('Total (7d)')).toBeDefined();
      expect(screen.getByText('100')).toBeDefined();
      expect(screen.getByText('95')).toBeDefined();
    });
  });

  it('calls replayEvent when Replay button is clicked', async () => {
    renderWithQuery(<WebhooksPage />);
    await waitFor(() => screen.getByText('Replay'));
    await userEvent.click(screen.getByText('Replay'));
    await waitFor(() => {
      expect(webhooksApi.replayEvent).toHaveBeenCalledWith('evt-1', expect.anything());
    });
  });

  it('filters events by provider when select changes', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.selectOptions(screen.getByDisplayValue('All providers'), 'stripe');
    await waitFor(() => {
      expect(webhooksApi.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'stripe' }),
      );
    });
  });

  it('filters events by status when select changes', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.selectOptions(screen.getByDisplayValue('All statuses'), 'FAILED');
    await waitFor(() => {
      expect(webhooksApi.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
    });
  });

  it('opens New Alert Rule dialog when button is clicked', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /new alert rule/i }));
    await waitFor(() => {
      expect(screen.getByText('Create Alert Rule')).toBeDefined();
    });
  });

  it('shows validation errors when alert rule form is submitted empty', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /new alert rule/i }));
    await waitFor(() => screen.getByText('Create Alert Rule'));

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeDefined();
    });
  });

  it('creates alert rule on valid form submit', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /new alert rule/i }));
    await waitFor(() => screen.getByText('Create Alert Rule'));

    await userEvent.type(screen.getByPlaceholderText('e.g. Failed payment alert'), 'My Rule');
    await userEvent.type(screen.getByPlaceholderText('e.g. status == FAILED'), 'status == FAILED');
    await userEvent.type(
      screen.getByPlaceholderText('e.g. ops@example.com or Slack webhook URL'),
      'ops@example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(webhooksApi.createAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Rule' }),
      );
    });
  });

  it('closes alert rule dialog on Cancel', async () => {
    renderWithQuery(<WebhooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /new alert rule/i }));
    await waitFor(() => screen.getByText('Create Alert Rule'));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText('Create Alert Rule')).toBeNull();
    });
  });

  it('displays existing alert rules', async () => {
    renderWithQuery(<WebhooksPage />);
    await waitFor(() => {
      expect(screen.getByText('Failed payment alert')).toBeDefined();
      expect(screen.getByText('email → ops@example.com')).toBeDefined();
    });
  });

  it('calls deleteAlertRule when Delete is clicked', async () => {
    renderWithQuery(<WebhooksPage />);
    await waitFor(() => screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(webhooksApi.deleteAlertRule).toHaveBeenCalledWith('rule-1', expect.anything());
    });
  });
});
