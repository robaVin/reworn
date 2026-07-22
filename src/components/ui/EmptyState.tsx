import { cn } from '@/lib/cn';

/**
 * Truthful empty / not-yet-connected state used across the application.
 * The optional `action` slot takes a Button or link.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  className?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  className,
  children,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-card border border-line bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 text-muted [&>svg]:h-10 [&>svg]:w-10 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-[1.4]"
        >
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children && (
        <div className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          {children}
        </div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
