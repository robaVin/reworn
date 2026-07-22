'use client';

import { useState } from 'react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Please check your details and try again.');
        return;
      }
      // Enumeration-safe: the same message shows whether or not the email exists.
      setMessage(data.message ?? 'Check your email to verify your account.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl">Create your account</h1>
      <p className="mt-2 text-sm text-muted">
        Free for buyers. Selling requires a subscription (coming in Stage 2).
      </p>

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-forest">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-control bg-terracotta-strong px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta-hover disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <a href="/login" className="font-semibold text-terracotta-strong">
          Log in
        </a>
      </p>
    </main>
  );
}
