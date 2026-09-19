'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function VerifyEmailForm() {
  const tAuth = useTranslations('Auth');
  const tc = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const params = useSearchParams();
  const preset = params.get('email') ?? '';
  const [email, setEmail] = useState(preset);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    preset ? tAuth('verifyPresetMessage') : null,
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
        setError(tAuth('tooManyRequests'));
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? tAuth('errInvalidEmail'));
        return;
      }
      setMessage(data.message ?? tAuth('verifyResentMessage'));
    } catch {
      setError(tc('somethingWrong'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={tAuth('checkEmailTitle')}
      subtitle={tAuth('verifySubtitle')}
      footer={
        <>
          {tAuth('readyToContinue')}{' '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            {tNav('login')}
          </Link>
        </>
      }
    >
      <Alert tone="success" title={tAuth('verificationEmailTitle')}>
        {message ?? tAuth('verifyEnterEmailPrompt')}
      </Alert>

      {/* Enumeration-safe guidance for the already-registered case: shown to
          everyone (never conditioned on whether the email exists), so an
          existing user is routed to sign-in without the app disclosing account
          existence. */}
      <p className="mt-4 text-sm text-muted">
        {tAuth('existingAccountHint')}{' '}
        <Link href="/login" className="font-semibold text-terracotta-strong">
          {tAuth('signIn')}
        </Link>
      </p>

      <form onSubmit={onResend} className="mt-6 space-y-4">
        <Field id="email" label={tAuth('emailLabel')}>
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
          {pending ? tAuth('sending') : tAuth('resendVerification')}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  const tAuth = useTranslations('Auth');
  const tc = useTranslations('Common');
  return (
    <Suspense
      fallback={
        <AuthCard title={tAuth('checkEmailTitle')} subtitle={tc('loading')}>
          <div className="animate-pulse-soft h-24 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
