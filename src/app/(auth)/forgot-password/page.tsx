'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError(t('tooManyRequests'));
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? t('errInvalidEmail'));
        return;
      }
      // Enumeration-safe confirmation — identical whether or not the email exists.
      setMessage(data.message ?? t('forgotSuccessMessage'));
    } catch {
      setError(tc('somethingWrong'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('forgotTitle')}
      subtitle={t('forgotSubtitle')}
      footer={
        <>
          {t('rememberedIt')}{' '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            {tNav('login')}
          </Link>
        </>
      }
    >
      {message ? (
        <Alert tone="success" title={t('checkEmailTitle')}>
          {message}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="email" label={t('emailLabel')}>
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
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t('sending') : t('sendResetLink')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
