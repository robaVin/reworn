/**
 * Structured logger with mandatory redaction.
 *
 * Logs are an exfiltration path. Anything logged may land in a third-party
 * aggregator, a CI artefact, or a screenshot in a support ticket. This module
 * therefore redacts by DENY-LIST ON KEYS plus PATTERN MATCHING ON VALUES, and
 * is covered by unit tests.
 *
 * It intentionally does not import `src/lib/env.ts`, so it stays usable and
 * testable without pulling in the server-only environment module.
 */

export const REDACTED = '[REDACTED]';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];

/**
 * Keys whose values are never safe to log. Matched case-insensitively as a
 * substring, so `accessToken`, `access_token` and `ACCESS-TOKEN` all match.
 */
const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  // Credentials & sessions
  'password',
  'passwd',
  'secret',
  'token', // covers access_token / refresh_token / idToken / csrfToken
  'cookie', // covers set-cookie
  'session',
  'authorization',
  'auth',
  'credential',
  'apikey',
  'api_key',
  'private_key',
  'privatekey',
  'service_role',
  'anon_key',
  // One-time codes
  'otp',
  'pin',
  'mfa',
  'totp',
  'verification_code',
  'verificationcode',
  // Payments
  'signature',
  'checksum',
  'hmac',
  'card',
  'pan',
  'cvv',
  'cvc',
  'iban',
  'merchant_password',
  // Direct PII
  'ssn',
  'national_id',
];

/** Keys that are PII but useful in support contexts — masked, not removed. */
const MASKED_KEY_PATTERNS: readonly string[] = ['email', 'phone', 'mobile'];

/** JSON Web Token, e.g. a Supabase access token accidentally interpolated. */
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g;
/** `Bearer <something>` appearing inside a free-text string. */
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;

function keyMatches(key: string, patterns: readonly string[]): boolean {
  const k = key.toLowerCase().replace(/[-_\s]/g, '');
  return patterns.some((p) => k.includes(p.replace(/[-_\s]/g, '')));
}

/** Masks an email as `j***@example.com`, a phone as `+3897****89`. */
export function maskValue(value: string): string {
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@');
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(value.length - 5, 1))}${value.slice(-2)}`;
}

/** Scrubs secrets that appear inside otherwise-innocent strings. */
function scrubString(value: string): string {
  let out = value
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, REDACTED);
  if (out.length > MAX_STRING_LENGTH) {
    out = `${out.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
  }
  return out;
}

/**
 * Recursively redacts a value. Safe against circular references and deep
 * structures. Unknown object shapes are handled defensively.
 */
export function redact(
  input: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') return scrubString(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (typeof input === 'bigint') return input.toString();
  if (typeof input === 'function') return '[Function]';
  if (typeof input === 'symbol') return input.toString();

  if (input instanceof Date) return input.toISOString();

  if (input instanceof Error) {
    return {
      name: input.name,
      message: scrubString(input.message),
      // Stacks can embed URLs containing tokens.
      stack: input.stack ? scrubString(input.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  if (typeof input === 'object') {
    if (seen.has(input)) return '[Circular]';
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map((item) => redact(item, depth + 1, seen));
    }

    // Headers / Map-like objects are common carriers of Authorization/Cookie.
    if (input instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of input.entries()) {
        out[String(k)] = redactEntry(String(k), v, depth, seen);
      }
      return out;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactEntry(k, v, depth, seen);
    }
    return out;
  }

  return '[Unknown]';
}

function redactEntry(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (keyMatches(key, SENSITIVE_KEY_PATTERNS)) return REDACTED;
  if (keyMatches(key, MASKED_KEY_PATTERNS) && typeof value === 'string') {
    return maskValue(value);
  }
  return redact(value, depth + 1, seen);
}

/* -------------------------------------------------------------------------- */

function currentLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return (LEVELS as readonly string[]).includes(raw ?? '')
    ? (raw as LogLevel)
    : 'info';
}

function enabled(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel());
}

export interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!enabled(level)) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message: scrubString(message),
    ...(context ? { context: redact(context) } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // `no-console` is disabled for this file only; this is the single sanctioned
  // console access point in the codebase.
  else console.log(line);
}

export const logger = {
  trace: (m: string, c?: LogContext) => emit('trace', m, c),
  debug: (m: string, c?: LogContext) => emit('debug', m, c),
  info: (m: string, c?: LogContext) => emit('info', m, c),
  warn: (m: string, c?: LogContext) => emit('warn', m, c),
  error: (m: string, c?: LogContext) => emit('error', m, c),
};
