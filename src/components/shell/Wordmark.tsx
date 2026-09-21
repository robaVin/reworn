import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Galerija monogram + wordmark, ported from the prototype's `.logo`. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'flex shrink-0 items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink max-[480px]:text-lg',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-gradient-to-br from-terracotta to-forest font-sans text-[15px] font-black text-cream max-[480px]:h-[26px] max-[480px]:w-[26px] max-[480px]:text-[13px]"
      >
        G
      </span>
      Galerija
    </Link>
  );
}
