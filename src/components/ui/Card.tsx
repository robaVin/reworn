import { cn } from '@/lib/cn';

/**
 * Surface card — the Sustainable prototype's `.pcard` / rounded listing shell.
 * Prefer this over inventing one-off bordered boxes.
 */
export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-line bg-surface p-6 shadow-soft',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
