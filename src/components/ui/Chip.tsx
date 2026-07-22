import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Filter chip — the prototype's `.chip`. Renders as a link (category
 * navigation) or a button (client-side filters, later increments).
 * Selection is conveyed with `aria-current`/`aria-pressed`, not colour alone
 * (selected chips are filled AND carry the state attribute).
 */
interface ChipBaseProps {
  selected?: boolean;
  className?: string;
  children: React.ReactNode;
}

type AsLink = ChipBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> & {
    href: string;
  };

type AsButton = ChipBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    href?: undefined;
  };

export type ChipProps = AsLink | AsButton;

function chipClasses(selected: boolean, className?: string) {
  return cn(
    'inline-flex min-h-9 items-center rounded-control border px-4 py-1.5 text-[13px] font-medium transition-colors duration-200',
    selected
      ? 'border-terracotta-strong bg-terracotta-strong text-cream'
      : 'border-line text-muted hover:border-terracotta-strong hover:text-ink',
    className,
  );
}

export function Chip(props: ChipProps) {
  const { selected = false, className, children, ...rest } = props;

  if ('href' in rest && typeof rest.href === 'string') {
    const { href, ...anchorProps } = rest as AsLink;
    return (
      <Link
        href={href}
        aria-current={selected ? 'true' : undefined}
        className={chipClasses(selected, className)}
        {...anchorProps}
      >
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as AsButton;
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={chipClasses(selected, className)}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
