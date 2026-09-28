import crypto from 'crypto';

// Returns null when the suite isn't configured (tests skip); throws when pointed at production.
export function readE2EEnv(env = process.env) {
    const baseUrl = env.E2E_BASE_URL;
    const supabaseUrl = env.E2E_SUPABASE_URL;
    const serviceKey = env.E2E_SUPABASE_SERVICE_KEY;
    if (!baseUrl || !supabaseUrl || !serviceKey) return null;
    if (!/staging|localhost|127\.0\.0\.1/.test(baseUrl) && env.E2E_ALLOW_ANY_TARGET !== '1') {
        throw new Error(`Refusing to run E2E against ${baseUrl} (not staging/localhost). Set E2E_ALLOW_ANY_TARGET=1 to override.`);
    }
    return {
        baseUrl: baseUrl.replace(/\/$/, ''),
        supabaseUrl: supabaseUrl.replace(/\/$/, ''),
        serviceKey,
        emailDomain: env.E2E_EMAIL_DOMAIN || 'funnel-e2e.test',
        testPhone: env.E2E_TEST_PHONE || '',   // a Supabase "test phone number", e.g. +919999900001
        testOtp: env.E2E_TEST_OTP || '',       // its fixed OTP, e.g. 123456
        runId: env.E2E_RUN_ID || crypto.randomBytes(4).toString('hex'),
    };
}
