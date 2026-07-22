'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Field, TextInput } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function loginErrorMessage(code: string | null): string | null {
  switch (code) {
    case 'auth':
      return 'Sign-in could not be completed. Please try again.';
    case 'oauth':
      return 'Google sign-in is unavailable or not configured for this project.';
    case 'config':
      return 'Authentication is not configured in this environment.';
    case 'session':
      return 'Your session ended. Please log in again to continue.';
    default:
      return null;
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get('next'), '/');
  const banner =
    loginErrorMessage(params.get('error')) ??
    (params.get('next') && !params.get('error')
      ? 'Please log in to continue to the page you requested.'
      : null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, redirectTo: next }),
      });
      if (!res.ok) {
        setPassword('');
        setError('Invalid email or password.');
        return;
      }
      const data = (await res.json()) as { redirectTo?: string };
      router.push(safeRedirectPath(data.redirectTo, '/'));
      router.refresh();
    } catch {
      setPassword('');
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your ReWorn account."
      footer={
        <>
          No account?{' '}
          <Link
            href="/register"
            className="font-semibold text-terracotta-strong"
          >
            Create one
          </Link>
        </>
      }
    >
      {banner && (
        <div className="mb-6">
          <Alert tone="info" title="Sign in required">
            {banner}
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="email" label="Email">
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
            disabled={pending}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-terracotta-strong"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Log in'}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons next={next} mode="login" />
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Welcome back" subtitle="Loading…">
          <div className="animate-pulse-soft h-40 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
