'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function VerifyEmailForm() {
  const params = useSearchParams();
  const preset = params.get('email') ?? '';
  const [email, setEmail] = useState(preset);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    preset
      ? 'If those details are valid, check your email to verify your account.'
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Please provide a valid email address.');
        return;
      }
      setMessage(
        data.message ??
          'If that email needs verification, a new message has been sent.',
      );
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle="We sent a verification link if the details were valid. Open it to activate your account, then log in."
      footer={
        <>
          Ready to continue?{' '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            Log in
          </Link>
        </>
      }
    >
      <Alert tone="success" title="Verification email">
        {message ??
          'Enter your email below if you need another verification message.'}
      </Alert>

      <form onSubmit={onResend} className="mt-6 space-y-4">
        <Field id="email" label="Email">
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="w-full"
        >
          {pending ? 'Sending…' : 'Resend verification email'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Check your email" subtitle="Loading…">
          <div className="animate-pulse-soft h-24 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
