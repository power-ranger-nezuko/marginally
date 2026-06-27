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
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import LoginPage from '../LoginPage';

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password fields with correct placeholders', () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText('you@company.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined();
  });

  it('renders the sign-in heading', () => {
    renderLoginPage();
    expect(screen.getByText('Welcome back')).toBeDefined();
  });

  it('shows validation error on submit with invalid email', async () => {
    renderLoginPage();
    const btn = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeDefined();
    });
  });

  it('shows validation error when password is empty', async () => {
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeDefined();
    });
  });

  it('calls login with the typed email and password', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('navigates to /dashboard on successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('shows server error message on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'bad@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeDefined();
    });
  });

  it('shows generic fallback error when login throws a non-Error', async () => {
    mockLogin.mockRejectedValueOnce('string error');
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/login failed/i)).toBeDefined();
    });
  });

  it('disables the button while submitting', async () => {
    // Simulate a slow login
    mockLogin.mockImplementation(() => new Promise(() => {}));
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /signing in/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('has a link to the signup page', () => {
    renderLoginPage();
    const link = screen.getByRole('link', { name: /create one/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain('/signup');
  });
});
