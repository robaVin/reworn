'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { PasswordStrengthHint } from '@/components/auth/PasswordStrengthHint';
import { Field, TextInput } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/**
 * Registration UI.
 *
 * Browser collects display name, password confirmation and terms acceptance
 * for UX. Only email, password and displayName are sent to the server.
 *
 * Durable legal consent recording is DEFERRED — accepting terms here is not
 * claimed as a permanent consent ledger entry.
 */
export default function RegisterPage() {
  const t = useTranslations('Auth');
  const tc = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!displayName.trim()) {
      setFieldError(t('errDisplayNameRequired'));
      return;
    }
    if (password.length < 8) {
      setFieldError(t('errPasswordMinLength'));
      return;
    }
    if (password !== confirm) {
      setConfirm('');
      setFieldError(t('errPasswordMismatch'));
      return;
    }
    if (!acceptedTerms) {
      setFieldError(t('errAcceptTerms'));
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      // Clear passwords after any attempt — never leave them on screen.
      setPassword('');
      setConfirm('');
      if (!res.ok) {
        setError(data.error ?? t('errCheckDetails'));
        return;
      }
      // Enumeration-safe: same outcome path whether or not the email exists.
      router.push(
        `/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`,
      );
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
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <>
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            {tNav('login')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="displayName" label={t('displayNameLabel')}>
          <TextInput
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="nickname"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={pending}
          />
        </Field>
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
        <Field
          id="password"
          label={t('passwordLabel')}
          hint={t('passwordHintRegister')}
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            disabled={pending}
            aria-describedby="password-strength"
          />
        </Field>
        <div id="password-strength">
          <PasswordStrengthHint password={password} />
        </div>
        <Field id="confirm" label={t('confirmPasswordLabel')}>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={setConfirm}
            disabled={pending}
          />
        </Field>

        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-line text-terracotta-strong"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={pending}
            required
          />
          <span>
            {t('agreeTerms')}
            <span className="mt-1 block text-xs text-muted">
              {t('consentDeferredNote')}
            </span>
          </span>
        </label>

        {(fieldError || error) && (
          <p role="alert" className="text-sm text-danger">
            {fieldError ?? error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t('creating') : tNav('register')}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons mode="register" />
      </div>

      <div className="mt-6">
        <Alert tone="info" title={t('buyerRoleTitle')}>
          {t('buyerRoleBody')}
        </Alert>
      </div>
    </AuthCard>
  );
}
