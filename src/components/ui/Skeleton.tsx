import { cn } from '@/lib/cn';

/**
 * Loading placeholder block. Shimmer collapses to a static tone under
 * `prefers-reduced-motion` (see globals.css). Purely decorative — wrap a
 * group of skeletons in an element with an accessible loading announcement
 * (see ListingGridSkeleton for the pattern).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse-soft rounded-card bg-sand', className)}
    />
  );
}
