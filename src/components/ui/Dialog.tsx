'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Modal dialog built on the native <dialog> element, which supplies focus
 * trapping, Escape dismissal, inert background and focus restoration
 * natively. `variant="drawer"` docks the panel to the right edge (mobile
 * navigation); `variant="center"` is a classic modal card.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  variant?: 'center' | 'drawer';
  className?: string;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  label,
  variant = 'center',
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Native `close` fires after Escape (via `cancel`) or programmatic close;
  // sync the parent state from it so the two can never drift apart.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  // Backdrop click closes (the dialog element itself is the click target
  // only when the click lands outside the inner panel).
  const handleClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) ref.current?.close();
  }, []);

  // Escape: let the native dialog cancel path run; also close explicitly for
  // environments where cancel/close-request delivery is incomplete.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      ref.current?.close();
    }
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'bg-transparent p-0 backdrop:bg-ink/50 backdrop:backdrop-blur-[2px]',
        variant === 'center' &&
          'm-auto max-h-[90dvh] w-[min(560px,calc(100vw-2rem))]',
        variant === 'drawer' &&
          'fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[min(400px,90vw)] max-w-none',
      )}
    >
      <div
        className={cn(
          'bg-cream text-ink',
          variant === 'center' &&
            'max-h-[90dvh] overflow-y-auto rounded-card border border-line shadow-lift',
          variant === 'drawer' &&
            'flex h-full flex-col overflow-y-auto border-l border-line',
          className,
        )}
      >
        {children}
      </div>
    </dialog>
  );
}
