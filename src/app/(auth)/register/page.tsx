'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
      setFieldError('Please enter a display name.');
      return;
    }
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setConfirm('');
      setFieldError('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setFieldError('Please accept the terms to continue.');
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
        setError(data.error ?? 'Please check your details and try again.');
        return;
      }
      // Enumeration-safe: same outcome path whether or not the email exists.
      router.push(
        `/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`,
      );
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
      title="Create your account"
      subtitle="Free for buyers. Everyone starts with a buyer account — seller access opens with a subscription later."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-terracotta-strong">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="displayName" label="Display name">
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
        <Field
          id="password"
          label="Password"
          hint="At least 8 characters. Confirmation is checked in your browser only."
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
        <Field id="confirm" label="Confirm password">
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
            I agree to the terms of use and privacy policy.
            <span className="mt-1 block text-xs text-muted">
              Acceptance is recorded in this browser session for the form only.
              A durable legal consent record is not stored yet and arrives in a
              later increment.
            </span>
          </span>
        </label>

        {(fieldError || error) && (
          <p role="alert" className="text-sm text-danger">
            {fieldError ?? error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons mode="register" />
      </div>

      <div className="mt-6">
        <Alert tone="info" title="Buyer role only">
          You cannot choose seller or admin at registration. Seller privileges
          require a real subscription later; admin is granted only by verified
          operators.
        </Alert>
      </div>
    </AuthCard>
  );
}
