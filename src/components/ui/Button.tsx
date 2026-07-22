import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Pill button — the Sustainable prototype's `.btn` family.
 *
 * Renders a real <button> or, when `href` is given, a Next <Link> with
 * identical styling. Server-component friendly (no client JS).
 *
 * Contrast note: filled variants use `terracotta-strong`/`forest`, whose
 * white text meets WCAG AA. The lighter decorative terracotta is reserved
 * for borders and large display text.
 */

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-terracotta-strong text-cream hover:bg-terracotta-hover border border-transparent',
  secondary:
    'bg-forest text-cream hover:bg-forest-hover border border-transparent',
  outline: 'border border-line text-ink hover:border-terracotta-strong',
  ghost: 'border border-transparent text-ink hover:bg-sand',
  danger: 'bg-danger text-white hover:bg-[#8f1e17] border border-transparent',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-7 py-3 text-[15px]',
};

const baseClasses =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control ' +
  'font-semibold transition-[transform,background-color,border-color] ' +
  'duration-300 hover:-translate-y-0.5 disabled:pointer-events-none ' +
  'disabled:opacity-60 motion-reduce:hover:translate-y-0';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    className,
    children,
    ...rest
  } = props;
  const classes = cn(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if ('href' in rest && typeof rest.href === 'string') {
    const { href, ...anchorProps } = rest as ButtonAsLink;
    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as ButtonAsButton;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
