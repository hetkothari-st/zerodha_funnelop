import { test, expect } from 'vitest';
import { friendlyError, NETWORK_MESSAGE, FALLBACK_MESSAGE } from './errors';

test('known codes map to friendly text', () => {
    expect(friendlyError({ code: 'invalid_credentials' })).toBe('Wrong email or password.');
    expect(friendlyError({ code: 'otp_expired' })).toBe('That code is wrong or has expired. Send a new one.');
    expect(friendlyError({ code: 'phone_exists' })).toBe('This mobile number is already linked to another account.');
});
test('network failures get the network message', () => {
    expect(friendlyError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(NETWORK_MESSAGE);
    expect(friendlyError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(NETWORK_MESSAGE);
});
test('unknown errors never leak raw text', () => {
    expect(friendlyError({ code: 'weird', message: '{"raw":"json"}' })).toBe(FALLBACK_MESSAGE);
});
test('no error → null', () => {
    expect(friendlyError(null)).toBeNull();
});
