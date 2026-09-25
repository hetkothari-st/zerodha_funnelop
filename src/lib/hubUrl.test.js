import { test, expect } from 'vitest';
import { hubUrlWithToken, reconnectPolicy, HUB_CLOSE } from './hubUrl';

test('hubUrlWithToken appends an encoded token', () => {
    expect(hubUrlWithToken('wss://hub.example', 'a.b+c')).toBe('wss://hub.example?token=a.b%2Bc');
    expect(hubUrlWithToken('wss://hub.example/?x=1', 't')).toBe('wss://hub.example/?x=1&token=t');
});
test('reconnectPolicy', () => {
    expect(reconnectPolicy(HUB_CLOSE.signedInElsewhere)).toBe('displaced');
    expect(reconnectPolicy(HUB_CLOSE.notApproved)).toBe('stop');
    expect(reconnectPolicy(HUB_CLOSE.unauthenticated)).toBe('retry');
    expect(reconnectPolicy(1006)).toBe('retry');
});
