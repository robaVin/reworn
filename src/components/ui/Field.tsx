import { cn } from '@/lib/cn';

/**
 * Labeled form field shell used by auth and future forms.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-[0.08em] text-muted"
      >
        {label}
      </label>
      {/* Clone is avoided: callers wire aria-describedby themselves via props
          when needed; Field exposes ids for composition. */}
      <div data-describedby={describedBy}>{children}</div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClasses =
  'w-full min-h-11 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink ' +
  'outline-none transition-colors placeholder:text-muted ' +
  'focus:border-terracotta-strong disabled:opacity-60';

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClasses, className)} {...props} />;
}
