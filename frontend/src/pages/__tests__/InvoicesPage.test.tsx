import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Defined via vi.hoisted so it is available inside the vi.mock factory (which is hoisted)
const mockTemplate = vi.hoisted(() => ({
  id: 'tpl-1',
  isDefault: true,
  brandingJson: { companyName: 'Acme Corp', primaryColor: '#4c6ef5', logoUrl: '' },
  localeSettings: { locale: 'en-US' },
  taxSettings: { showTax: false, taxRate: 0 },
}));

vi.mock('../../api/invoices', () => ({
  invoicesApi: {
    listTemplates: vi.fn().mockResolvedValue([mockTemplate]),
    listGeneratedInvoices: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'inv-1',
          stripeInvoiceId: 'in_123',
          language: 'en',
          generatedAt: '2024-06-01T00:00:00Z',
        },
      ],
      total: 1,
    }),
    createTemplate: vi.fn().mockResolvedValue({ id: 'tpl-new' }),
    updateTemplate: vi.fn().mockResolvedValue({}),
    getDownloadUrl: vi.fn().mockResolvedValue({ url: 'https://example.com/invoice.pdf' }),
  },
}));

const mockOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockOpen, writable: true });

import InvoicesPage from '../InvoicesPage';
import { invoicesApi } from '../../api/invoices';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and New Template button', () => {
    renderWithQuery(<InvoicesPage />);
    expect(screen.getByText('Invoices')).toBeDefined();
    expect(screen.getByRole('button', { name: /new template/i })).toBeDefined();
  });

  it('displays template card from API', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeDefined();
    });
  });

  it('shows en-US locale and Default label on template card', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => screen.getByText('Acme Corp'));
    expect(screen.getByText(/en-US.*Default/)).toBeDefined();
  });

  it('opens Create Template dialog when New Template is clicked', async () => {
    renderWithQuery(<InvoicesPage />);
    await userEvent.click(screen.getByRole('button', { name: /new template/i }));
    await waitFor(() => {
      expect(screen.getByText('Create Template')).toBeDefined();
    });
  });

  it('creates template with typed company name', async () => {
    renderWithQuery(<InvoicesPage />);
    await userEvent.click(screen.getByRole('button', { name: /new template/i }));
    await waitFor(() => screen.getByText('Create Template'));

    await userEvent.type(screen.getByPlaceholderText('Acme Inc.'), 'My Company');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(invoicesApi.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          brandingJson: expect.objectContaining({ companyName: 'My Company' }),
        }),
      );
    });
  });

  it('closes Create Template dialog on Cancel', async () => {
    renderWithQuery(<InvoicesPage />);
    await userEvent.click(screen.getByRole('button', { name: /new template/i }));
    await waitFor(() => screen.getByText('Create Template'));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText('Create Template')).toBeNull();
    });
  });

  it('opens Edit Template dialog when template card is clicked', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => screen.getByText('Acme Corp'));

    // Template card is a <button> — click the company name text inside it
    await userEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => {
      expect(screen.getByText('Edit Template')).toBeDefined();
    });
  });

  it('pre-fills form with existing template values when editing', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => screen.getByText('Acme Corp'));
    await userEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => screen.getByText('Edit Template'));

    expect(screen.getByDisplayValue('Acme Corp')).toBeDefined();
    expect(screen.getByDisplayValue('en-US')).toBeDefined();
  });

  it('calls updateTemplate when editing an existing template', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => screen.getByText('Acme Corp'));
    await userEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => screen.getByText('Edit Template'));

    const companyInput = screen.getByDisplayValue('Acme Corp');
    await userEvent.clear(companyInput);
    await userEvent.type(companyInput, 'Updated Corp');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(invoicesApi.updateTemplate).toHaveBeenCalledWith(
        'tpl-1',
        expect.objectContaining({
          brandingJson: expect.objectContaining({ companyName: 'Updated Corp' }),
        }),
      );
    });
  });

  it('shows generated invoices in the table', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText('in_123')).toBeDefined();
    });
  });

  it('calls getDownloadUrl and opens the URL when Download is clicked', async () => {
    renderWithQuery(<InvoicesPage />);
    await waitFor(() => screen.getByText('Download'));
    await userEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(invoicesApi.getDownloadUrl).toHaveBeenCalledWith('inv-1');
      expect(mockOpen).toHaveBeenCalledWith('https://example.com/invoice.pdf', '_blank');
    });
  });
});
