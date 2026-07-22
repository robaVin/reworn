import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Circular icon action — the prototype's `.iconbtn` (wishlist / account).
 *
 * `label` is mandatory and becomes the accessible name; the icon itself is
 * decorative. Minimum hit area is 44×44px. Optional numeric badge.
 */
interface IconButtonBaseProps {
  label: string;
  badge?: number;
  className?: string;
  children: React.ReactNode; // the svg icon
}

type AsButton = IconButtonBaseProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'className' | 'aria-label'
  > & { href?: undefined };

type AsLink = IconButtonBaseProps &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    'className' | 'aria-label' | 'href'
  > & { href: string };

export type IconButtonProps = AsButton | AsLink;

const base =
  'relative inline-flex h-11 w-11 items-center justify-center rounded-full ' +
  'border border-line text-ink transition-[border-color,transform] duration-300 ' +
  'hover:-translate-y-px hover:border-terracotta-strong ' +
  'motion-reduce:hover:translate-y-0';

function Badge({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-terracotta-strong px-1 text-[10.5px] font-bold text-cream"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

export function IconButton(props: IconButtonProps) {
  const { label, badge, className, children, ...rest } = props;
  const classes = cn(base, className);

  if ('href' in rest && typeof rest.href === 'string') {
    const { href, ...anchorProps } = rest as AsLink;
    return (
      <Link href={href} aria-label={label} className={classes} {...anchorProps}>
        {children}
        {typeof badge === 'number' && <Badge value={badge} />}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as AsButton;
  return (
    <button type={type} aria-label={label} className={classes} {...buttonProps}>
      {children}
      {typeof badge === 'number' && <Badge value={badge} />}
    </button>
  );
}
