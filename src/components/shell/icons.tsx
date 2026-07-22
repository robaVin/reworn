/**
 * Shared line icons ported from the prototype's inline SVGs.
 * All are decorative (aria-hidden); accessible names live on the
 * surrounding control.
 */

function LineIcon({
  className = 'h-[19px] w-[19px]',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} fill-none stroke-current stroke-[1.7]`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </LineIcon>
  );
}

export function HeartIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z" />
    </LineIcon>
  );
}

export function MessageIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </LineIcon>
  );
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </LineIcon>
  );
}

export function MenuIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </LineIcon>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </LineIcon>
  );
}

export function LeafIcon({ className }: { className?: string }) {
  return (
    <LineIcon className={className}>
      <path d="M11 20A7 7 0 014 13c0-5 4-9 10-10 3-0.5 6 0 7 1-1 6-3 10-6 13a7 7 0 01-4 3z" />
      <path d="M4 21c4-6 8-9 13-12" />
    </LineIcon>
  );
}
