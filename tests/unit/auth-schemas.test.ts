import { describe, expect, it } from 'vitest';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  updatePasswordSchema,
} from '@/modules/auth/schemas';

describe('auth schemas', () => {
  it('normalises email on register and rejects short passwords', () => {
    const ok = registerSchema.safeParse({
      email: '  Ada@Example.COM ',
      password: 'password1',
      displayName: 'Ada',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe('ada@example.com');

    const short = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'short',
    });
    expect(short.success).toBe(false);
  });

  it('does not accept a role field as a trusted register input', () => {
    const parsed = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'password1',
      role: 'admin',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.prototype.hasOwnProperty.call(parsed.data, 'role')).toBe(
        false,
      );
    }
  });

  it('keeps login password length policy opaque (any non-empty)', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success,
    ).toBe(true);
  });

  it('validates email-only and update-password payloads', () => {
    expect(emailOnlySchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(
      updatePasswordSchema.safeParse({ password: 'password1' }).success,
    ).toBe(true);
    expect(updatePasswordSchema.safeParse({ password: 'short' }).success).toBe(
      false,
    );
  });
});
