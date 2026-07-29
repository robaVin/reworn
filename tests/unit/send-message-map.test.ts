import { describe, it, expect } from 'vitest';
import { mapSendError } from '@/modules/messaging/conversation-actions';
import { MessageRejectedError } from '@/modules/messaging/errors';
import { AuthorizationError } from '@/modules/auth/errors';

describe('mapSendError', () => {
  it('maps normalisation reasons to safe kinds', () => {
    expect(mapSendError(new MessageRejectedError('empty'))).toBe('empty');
    expect(mapSendError(new MessageRejectedError('too_long'))).toBe('tooLong');
    expect(mapSendError(new MessageRejectedError('control_char'))).toBe(
      'controlChar',
    );
    expect(mapSendError(new MessageRejectedError('not_a_string'))).toBe(
      'validationError',
    );
  });

  it('maps a 404 to notFound (uniform non-disclosure)', () => {
    expect(mapSendError(new AuthorizationError(404, 'not_found'))).toBe(
      'notFound',
    );
  });

  it('maps any other error to unexpected with no raw detail surfaced', () => {
    const kind = mapSendError(new Error('P2002 raw prisma near messages'));
    expect(kind).toBe('unexpected');
    expect(JSON.stringify(kind)).not.toContain('prisma');
  });
});
