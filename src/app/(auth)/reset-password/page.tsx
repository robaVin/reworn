'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordStrengthHint } from '@/components/auth/PasswordStrengthHint';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('error') === 'expired';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    expired
      ? 'This reset link is invalid or has expired. Request a new one.'
      : null,
  );
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setConfirm('');
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setConfirm('');
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(
          data.error ??
            'This reset link is invalid or has expired. Request a new one.',
        );
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 1600);
    } catch {
      setPassword('');
      setConfirm('');
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use a strong password you have not used elsewhere."
      footer={
        <>
          <Link
            href="/forgot-password"
            className="font-semibold text-terracotta-strong"
          >
            Request a new reset link
          </Link>
          {' · '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            Log in
          </Link>
        </>
      }
    >
      {success ? (
        <Alert tone="success" title="Password updated">
          Your password has been updated. Redirecting you to log in…
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {expired && (
            <Alert tone="warning" title="Link expired">
              Request a fresh reset email, then open the new link before setting
              a password.
            </Alert>
          )}
          <Field id="password" label="New password">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={setPassword}
              disabled={pending || expired}
            />
          </Field>
          <PasswordStrengthHint password={password} />
          <Field id="confirm" label="Confirm password">
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={setConfirm}
              disabled={pending || expired}
            />
          </Field>
          {error && !expired && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || expired}
            className="w-full"
          >
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Choose a new password" subtitle="Loading…">
          <div className="animate-pulse-soft h-40 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
