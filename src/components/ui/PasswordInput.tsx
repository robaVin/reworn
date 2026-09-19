'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { TextInput } from './Field';

/**
 * Password field with accessible show/hide toggle.
 * Never used to redisplay a failed submission's password from the server —
 * the value lives only in React state controlled by the parent.
 */
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  minLength,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const t = useTranslations('Auth');
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextInput
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn('pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
        aria-pressed={visible}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
      >
        {visible ? t('hide') : t('show')}
      </button>
    </div>
  );
}
