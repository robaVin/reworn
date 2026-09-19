'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordStrengthHint } from '@/components/auth/PasswordStrengthHint';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('error') === 'expired';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    expired ? t('resetLinkInvalid') : null,
  );
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('errPasswordMinLength'));
      return;
    }
    if (password !== confirm) {
      setConfirm('');
      setError(t('errPasswordMismatch'));
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
        setError(data.error ?? t('resetLinkInvalid'));
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 1600);
    } catch {
      setPassword('');
      setConfirm('');
      setError(tc('somethingWrong'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('resetTitle')}
      subtitle={t('resetSubtitle')}
      footer={
        <>
          <Link
            href="/forgot-password"
            className="font-semibold text-terracotta-strong"
          >
            {t('requestNewResetLink')}
          </Link>
          {' · '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            {tNav('login')}
          </Link>
        </>
      }
    >
      {success ? (
        <Alert tone="success" title={t('passwordUpdatedTitle')}>
          {t('passwordUpdatedBody')}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {expired && (
            <Alert tone="warning" title={t('linkExpiredTitle')}>
              {t('linkExpiredBody')}
            </Alert>
          )}
          <Field id="password" label={t('newPasswordLabel')}>
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
          <Field id="confirm" label={t('confirmPasswordLabel')}>
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
            {pending ? t('updating') : t('updatePassword')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  return (
    <Suspense
      fallback={
        <AuthCard title={t('resetTitle')} subtitle={tc('loading')}>
          <div className="animate-pulse-soft h-40 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
