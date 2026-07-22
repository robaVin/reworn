/**
 * Lightweight password guidance for registration / reset.
 * Pure presentation — Supabase remains the hashing/policy authority.
 */
export function passwordStrengthLabel(password: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
} {
  if (!password) return { score: 0, label: 'Enter a password' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password))
    score += 1;
  if (score <= 1)
    return { score: score as 0 | 1, label: 'Too short or simple' };
  if (score === 2) return { score: 2, label: 'Acceptable' };
  return { score: 3, label: 'Stronger' };
}

export function PasswordStrengthHint({ password }: { password: string }) {
  const { score, label } = passwordStrengthLabel(password);
  const widths = ['w-1/4', 'w-1/2', 'w-3/4', 'w-full'] as const;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-control bg-sand">
        <div
          className={`h-full rounded-control transition-all ${
            score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : 'bg-forest'
          } ${widths[score]}`}
        />
      </div>
      <p className="text-xs text-muted">
        {label}. Use at least 8 characters; longer is better.
      </p>
    </div>
  );
}
