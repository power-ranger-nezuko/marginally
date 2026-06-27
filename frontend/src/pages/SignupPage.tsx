import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import zxcvbn from 'zxcvbn';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';

const schema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

const STRENGTH_COLORS = [
  'bg-red-400',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-lime-500',
  'bg-emerald-500',
];

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('409') || msg.includes('conflict') || msg.includes('already')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (msg.includes('breach') || msg.includes('pwned')) {
      return 'This password has appeared in a data breach. Please choose a different one.';
    }
    if (msg.includes('400')) {
      return 'Please check your details and try again.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Connection error — please check your internet and try again.';
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export default function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const password = watch('password', '');

  useEffect(() => {
    if (password) setPasswordStrength(zxcvbn(password).score);
    else setPasswordStrength(0);
  }, [password]);

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    try {
      await authApi.signup(values.businessName, values.email, values.password);
      await login(values.email, values.password);
      navigate('/dashboard?welcome=1', { replace: true });
    } catch (err) {
      setServerError(friendlyError(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
          <rect width="32" height="32" rx="8" fill="#4f46e5" />
          <path d="M8 22V10l8 6 8-6v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-lg font-bold tracking-tight text-gray-900">Marginly</span>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Start recovering revenue in minutes — no credit card needed</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Business name
              </label>
              <input
                type="text"
                {...register('businessName')}
                className="input"
                placeholder="Acme Coffee Co."
                autoComplete="organization"
                autoFocus
              />
              {errors.businessName && (
                <p className="mt-1 text-xs text-red-600">{errors.businessName.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Work email
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                {...register('password')}
                className="input"
                placeholder="8+ characters"
                autoComplete="new-password"
              />
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i < passwordStrength ? STRENGTH_COLORS[passwordStrength] : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
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
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-[11px] text-gray-400">
              By continuing you agree to our{' '}
              <a href="#" className="underline hover:text-gray-600">Terms of Service</a>{' '}
              and{' '}
              <a href="#" className="underline hover:text-gray-600">Privacy Policy</a>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
