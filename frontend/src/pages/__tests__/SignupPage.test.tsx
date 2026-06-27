import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/auth', () => ({
  authApi: { signup: vi.fn() },
}));

import SignupPage from '../SignupPage';

function renderSignupPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders business name, email, and password fields', () => {
    renderSignupPage();
    expect(screen.getByPlaceholderText('Acme Coffee Co.')).toBeDefined();
    expect(screen.getByPlaceholderText('you@company.com')).toBeDefined();
    expect(screen.getByPlaceholderText('8+ characters')).toBeDefined();
  });

  it('renders the Create account heading', () => {
    renderSignupPage();
    expect(screen.getByText('Create your account')).toBeDefined();
  });

  it('has a Sign in link pointing to /login', () => {
    renderSignupPage();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain('/login');
  });

  it('shows business name validation error on empty submit', async () => {
    renderSignupPage();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText('Business name is required')).toBeDefined();
    });
  });

  it('shows email validation error for invalid email', async () => {
    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'My Business');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'notanemail');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeDefined();
    });
  });

  it('shows password length validation error', async () => {
    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'My Business');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('8+ characters'), 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
    });
  });

  it('calls authApi.signup then login on successful submit', async () => {
    const { authApi } = await import('../../api/auth');
    vi.mocked(authApi.signup).mockResolvedValueOnce({} as any);
    mockLogin.mockResolvedValueOnce(undefined);

    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'Acme Inc');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('8+ characters'), 'securepass');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authApi.signup).toHaveBeenCalledWith('Acme Inc', 'test@example.com', 'securepass');
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'securepass');
    });
  });

  it('navigates to /dashboard?welcome=1 after successful signup', async () => {
    const { authApi } = await import('../../api/auth');
    vi.mocked(authApi.signup).mockResolvedValueOnce({} as any);
    mockLogin.mockResolvedValueOnce(undefined);

    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'Acme Inc');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('8+ characters'), 'securepass');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard?welcome=1', { replace: true });
    });
  });

  it('shows conflict error when signup returns 409', async () => {
    const { authApi } = await import('../../api/auth');
    vi.mocked(authApi.signup).mockRejectedValueOnce(new Error('409 conflict'));

    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'Acme Inc');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'existing@example.com');
    await userEvent.type(screen.getByPlaceholderText('8+ characters'), 'securepass');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/account with this email already exists/i)).toBeDefined();
    });
  });

  it('disables button while submitting', async () => {
    const { authApi } = await import('../../api/auth');
    vi.mocked(authApi.signup).mockImplementation(() => new Promise(() => {}));

    renderSignupPage();
    await userEvent.type(screen.getByPlaceholderText('Acme Coffee Co.'), 'Acme Inc');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('8+ characters'), 'securepass');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /creating account/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
