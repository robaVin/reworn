'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { updateDisplayNameAction } from '@/modules/auth/account-actions';

/**
 * Edit the signed-in user's display name — the name shown to the people they
 * message. The server action targets the verified user's own profile; this
 * component only presents the field and surfaces the real result. Leaving it
 * blank clears the name (the user then appears as the neutral fallback).
 */
export function DisplayNameForm({ initial }: { initial: string }) {
  const t = useTranslations('Account');
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = name.trim() !== initial.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateDisplayNameAction(name.trim());
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error === 'rate_limited' ? t('tooMany') : t('saveError'));
      }
    } catch {
      setError(t('saveError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field id="displayName" label={t('displayNameLabel')}>
        <TextInput
          id="displayName"
          value={name}
          maxLength={80}
          placeholder={t('displayNamePlaceholder')}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
            setError(null);
          }}
        />
      </Field>
      <p className="text-xs text-muted">{t('displayNameHelp')}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-forest">{t('saved')}</p>}
      <Button type="submit" disabled={pending || !changed}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
