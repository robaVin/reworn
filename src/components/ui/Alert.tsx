import { cn } from '@/lib/cn';

/**
 * Inline feedback surface. Status is conveyed by icon + text, never colour
 * alone. `assertive` alerts use role="alert" (errors); the rest use
 * role="status" so screen readers announce async outcomes politely.
 */
type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  info: 'border-line bg-surface text-ink',
  success: 'border-forest/30 bg-forest/5 text-forest',
  warning: 'border-warning/30 bg-warning/5 text-warning',
  danger: 'border-danger/30 bg-danger/5 text-danger',
};

const toneIcons: Record<Tone, React.ReactNode> = {
  info: <path d="M12 8h.01M11 12h1v4h1M12 21a9 9 0 100-18 9 9 0 000 18z" />,
  success: <path d="M20 6L9 17l-5-5" />,
  warning: (
    <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
  ),
  danger: <path d="M12 8v5m0 3.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />,
};

export interface AlertProps {
  tone?: Tone;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function Alert({
  tone = 'info',
  title,
  className,
  children,
}: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-card border p-4 text-sm',
        toneClasses[tone],
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-current stroke-2"
      >
        {toneIcons[tone]}
      </svg>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && 'mt-1', 'leading-relaxed')}>{children}</div>
      </div>
    </div>
  );
}
