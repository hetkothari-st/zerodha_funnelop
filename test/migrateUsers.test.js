import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigration, createSupabaseAdmin, runMigration } from '../scripts/lib/migrateUsers.js';

test('planMigration keeps active rows, lowercases emails, routes non-emails to manual', () => {
    const plan = planMigration([
        { username: 'Asha@Example.com', is_active: true },
        { username: 'ravi', is_active: true },
        { username: 'old@example.com', is_active: false },
        { username: ' bob@x.in ', is_active: true },
        { username: 'asha@example.com', is_active: true },
    ]);
    assert.deepEqual(plan.migrate, [
        { email: 'asha@example.com', name: 'asha', username: 'Asha@Example.com' },
        { email: 'bob@x.in', name: 'bob', username: ' bob@x.in ' },
    ]);
    assert.deepEqual(plan.manual, [{ username: 'ravi', reason: 'username is not an email' }]);
});

// Fake GoTrue + PostgREST for one "new" project and one "legacy" project.
function fakeProjects({ legacyRows = [], existing = [], failFor = [] } = {}) {
    const users = new Map(existing.map((e, i) => [e, `id-${i}`]));
    const calls = [];
    const profiles = new Map();
    const fetchImpl = async (url, init = {}) => {
        const u = new URL(url);
        const method = init.method || 'GET';
        calls.push({ method, path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
        if (u.origin === 'https://legacy.supabase.co' && u.pathname === '/rest/v1/app_users') {
            return new Response(JSON.stringify(legacyRows), { status: 200 });
        }
        if (u.pathname === '/auth/v1/admin/users' && method === 'POST') {
            const { email } = JSON.parse(init.body);
            if (failFor.includes(email)) throw new Error('ECONNRESET');
            if (users.has(email)) return new Response(JSON.stringify({ code: 'email_exists', msg: 'exists' }), { status: 422 });
            const id = `id-${users.size}`; users.set(email, id);
            return new Response(JSON.stringify({ id, email }), { status: 200 });
        }
        if (u.pathname === '/auth/v1/admin/users' && method === 'GET') {
            const page = Number(u.searchParams.get('page') || 1);
            const list = page === 1 ? [...users].map(([email, id]) => ({ id, email })) : [];
            return new Response(JSON.stringify({ users: list }), { status: 200 });
        }
        if (u.pathname === '/rest/v1/profiles' && method === 'PATCH') {
            const id = u.searchParams.get('id').replace('eq.', '');
            profiles.set(id, JSON.parse(init.body));
            return new Response(null, { status: 204 });
        }
        if (u.pathname === '/auth/v1/recover' && method === 'POST') return new Response('{}', { status: 200 });
        throw new Error(`unexpected ${method} ${url}`);
    };
    return { fetchImpl, calls, users, profiles };
}

const quiet = { info() {}, warn() {}, error() {} };

function setup(opts) {
    const f = fakeProjects(opts);
    const legacy = createSupabaseAdmin({ url: 'https://legacy.supabase.co', serviceKey: 'old', fetchImpl: f.fetchImpl });
    const target = createSupabaseAdmin({ url: 'https://new.supabase.co', serviceKey: 'new', fetchImpl: f.fetchImpl });
    return { f, legacy, target };
}

test('legacy read never selects the password column', async () => {
    const { f, legacy } = setup({ legacyRows: [] });
    await legacy.listLegacyUsers();
    const q = f.calls[0].path;
    assert.match(q, /select=username,is_active/);
    assert.doesNotMatch(q, /password/);
    assert.match(q, /is_active=eq\.true/);
});

test('dry run writes nothing', async () => {
    const { f, legacy, target } = setup({ legacyRows: [{ username: 'a@x.in', is_active: true }] });
    const r = await runMigration({ legacy, target, appOrigin: 'https://funnelop.in', apply: false, log: quiet });
    assert.equal(r.dryRun, true);
    assert.deepEqual(r.created, ['a@x.in']);
    assert.equal(f.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('apply creates, approves and sends a password-set email', async () => {
    const { f, legacy, target } = setup({ legacyRows: [{ username: 'a@x.in', is_active: true }, { username: 'ravi', is_active: true }] });
    const r = await runMigration({ legacy, target, appOrigin: 'https://funnelop.in', apply: true, log: quiet });
    assert.deepEqual(r.created, ['a@x.in']);
    assert.deepEqual(r.manual, [{ username: 'ravi', reason: 'username is not an email' }]);
    const create = f.calls.find((c) => c.method === 'POST' && c.path === '/auth/v1/admin/users');
    assert.deepEqual(create.body, { email: 'a@x.in', email_confirm: true, user_metadata: { full_name: 'a' } });
    assert.equal(create.headers.Authorization, 'Bearer new');
    assert.deepEqual(f.profiles.get('id-0'), { status: 'approved', approved_at: f.profiles.get('id-0').approved_at });
    assert.ok(!Number.isNaN(Date.parse(f.profiles.get('id-0').approved_at)));
    const recover = f.calls.find((c) => c.path.startsWith('/auth/v1/recover'));
    assert.equal(recover.path, `/auth/v1/recover?redirect_to=${encodeURIComponent('https://funnelop.in/reset-password')}`);
    assert.deepEqual(recover.body, { email: 'a@x.in' });
});

test('rerun is idempotent: existing users are skipped but still approved, no second email', async () => {
    const { f, legacy, target } = setup({ legacyRows: [{ username: 'a@x.in', is_active: true }], existing: ['a@x.in'] });
    const r = await runMigration({ legacy, target, appOrigin: 'https://funnelop.in', apply: true, log: quiet });
    assert.deepEqual(r.skipped_exists, ['a@x.in']);
    assert.deepEqual(r.created, []);
    assert.equal(f.profiles.get('id-0').status, 'approved');
    assert.equal(f.calls.filter((c) => c.path.startsWith('/auth/v1/recover')).length, 0);
});

test('one failing user does not stop the run', async () => {
    const { legacy, target } = setup({ legacyRows: [{ username: 'bad@x.in', is_active: true }, { username: 'good@x.in', is_active: true }], failFor: ['bad@x.in'] });
    const r = await runMigration({ legacy, target, appOrigin: 'https://funnelop.in', apply: true, log: quiet });
    assert.deepEqual(r.failed, [{ email: 'bad@x.in', reason: 'ECONNRESET' }]);
    assert.deepEqual(r.created, ['good@x.in']);
});
