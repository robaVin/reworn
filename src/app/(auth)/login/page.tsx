'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeRedirectPath } from '@/lib/safe-redirect';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The `next` param is also re-validated server-side; never trust it raw.
  const next = safeRedirectPath(params.get('next'), '/');

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
        setError('Invalid email or password.');
        return;
      }
      const data = (await res.json()) as { redirectTo?: string };
      router.push(safeRedirectPath(data.redirectTo, '/'));
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Log in to continue.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-xs uppercase tracking-wide text-muted"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-xs uppercase tracking-wide text-muted"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-control bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta-hover disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        No account?{' '}
        <a href="/register" className="font-semibold text-terracotta">
          Create one
        </a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
