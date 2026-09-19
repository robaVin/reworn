'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Field, TextInput } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function loginErrorMessageKey(code: string | null): string | null {
  switch (code) {
    case 'auth':
      return 'errorAuth';
    case 'oauth':
      return 'errorOAuth';
    case 'config':
      return 'errorConfig';
    case 'session':
      return 'errorSession';
    default:
      return null;
  }
}

function LoginForm() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get('next'), '/');
  const errorKey = loginErrorMessageKey(params.get('error'));
  const banner =
    (errorKey ? t(errorKey) : null) ??
    (params.get('next') && !params.get('error')
      ? t('loginRequiredNext')
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
        setError(t('invalidCredentials'));
        return;
      }
      const data = (await res.json()) as { redirectTo?: string };
      router.push(safeRedirectPath(data.redirectTo, '/'));
      router.refresh();
    } catch {
      setPassword('');
      setError(tc('somethingWrong'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link
            href="/register"
            className="font-semibold text-terracotta-strong"
          >
            {t('createOne')}
          </Link>
        </>
      }
    >
      {banner && (
        <div className="mb-6">
          <Alert tone="info" title={t('signInRequired')}>
            {banner}
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="email" label={t('emailLabel')}>
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
        <Field id="password" label={t('passwordLabel')}>
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
            {t('forgotPasswordLink')}
          </Link>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t('signingIn') : tNav('login')}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons next={next} mode="login" />
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  return (
    <Suspense
      fallback={
        <AuthCard title={t('loginTitle')} subtitle={tc('loading')}>
          <div className="animate-pulse-soft h-40 rounded-xl bg-sand" />
        </AuthCard>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
