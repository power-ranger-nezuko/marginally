import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheckIcon, ZapIcon, DollarSignIcon } from '../components/ui/Icons';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { Icon: DollarSignIcon, text: 'Recover failed payments automatically' },
  { Icon: ZapIcon, text: 'Save churning subscribers in real time' },
  { Icon: ShieldCheckIcon, text: 'Dispute chargebacks with evidence bundles' },
];

function MarginlyWordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
        <rect width="32" height="32" rx="8" fill="#4f46e5" />
        <path
          d="M8 22V10l8 6 8-6v12"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg font-bold tracking-tight text-white">Marginly</span>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    try {
      await login(values.email, values.password);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setServerError(msg);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="hidden w-1/2 flex-col justify-between bg-brand-700 p-10 lg:flex">
        <MarginlyWordmark />

        <div>
          <p className="mb-8 text-2xl font-bold leading-snug text-white">
            The merchant revenue toolkit
            <br />
            that pays for itself.
          </p>
          <ul className="space-y-4">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-100">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-300">© {new Date().getFullYear()} Marginly. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        {/* Mobile wordmark */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
            <rect width="32" height="32" rx="8" fill="#4f46e5" />
            <path d="M8 22V10l8 6 8-6v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-gray-900">Marginly</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account to continue</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  type="email"
                  {...register('email')}
                  className="input"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Password</label>
                </div>
                <input
                  type="password"
                  {...register('password')}
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {serverError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full justify-center py-2.5"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
