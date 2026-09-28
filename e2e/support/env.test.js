import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readE2EEnv } from './env.js';

const base = { E2E_BASE_URL: 'https://funnel-op-staging.up.railway.app', E2E_SUPABASE_URL: 'https://x.supabase.co', E2E_SUPABASE_SERVICE_KEY: 'k' };

test('guard refuses production target', () => {
    assert.throws(() => readE2EEnv({ ...base, E2E_BASE_URL: 'https://funnelop.in' }), /refusing/i);
});
test('allows staging and localhost, and explicit override', () => {
    assert.equal(readE2EEnv(base).baseUrl, base.E2E_BASE_URL);
    assert.equal(readE2EEnv({ ...base, E2E_BASE_URL: 'http://localhost:5191' }).baseUrl, 'http://localhost:5191');
    assert.equal(readE2EEnv({ ...base, E2E_BASE_URL: 'https://funnelop.in', E2E_ALLOW_ANY_TARGET: '1' }).baseUrl, 'https://funnelop.in');
});
test('defaults and run id', () => {
    const e = readE2EEnv(base);
    assert.equal(e.emailDomain, 'funnel-e2e.test');
    assert.match(e.runId, /^[a-z0-9]{8}$/);
});
test('missing required vars → null (suite skips)', () => {
    assert.equal(readE2EEnv({}), null);
});
