import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuthMiddleware } from '../server/auth/middleware.js';
import { fakeAuth, approvedUser, approvedAdmin } from './helpers/fakeAuth.js';
import { listen } from './helpers/http.js';

async function serve(auth) {
    const app = express();
    app.get('/u', ...auth.requireUser, (req, res) => res.json({ ok: true, userId: req.auth.userId }));
    app.get('/a', ...auth.requireAdmin, (req, res) => res.json({ ok: true }));
    return listen(app);
}
const get = (url, token) => fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('no Authorization header → 401 unauthenticated', async () => {
    const { auth } = fakeAuth();
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/u`);
        assert.equal(res.status, 401);
        assert.equal((await res.json()).code, 'unauthenticated');
    } finally { await srv.close(); }
});

test('invalid token → 401 unauthenticated', async () => {
    const { auth } = fakeAuth({ user: approvedUser });
    const srv = await serve(auth);
    try {
        assert.equal((await (await get(`${srv.url}/u`, 'garbage')).json()).code, 'unauthenticated');
    } finally { await srv.close(); }
});

test('unknown user (no profile row) → 401 unauthenticated', async () => {
    const { auth, tokenFor } = fakeAuth();
    const srv = await serve(auth);
    try {
        assert.equal((await get(`${srv.url}/u`, tokenFor('ghost'))).status, 401);
    } finally { await srv.close(); }
});

test('pending user → 403 not_approved', async () => {
    const { auth, tokenFor } = fakeAuth({ user: { ...approvedUser, status: 'pending' } });
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/u`, tokenFor('user'));
        assert.equal(res.status, 403);
        assert.equal((await res.json()).code, 'not_approved');
    } finally { await srv.close(); }
});

test('approved user on the current session → 200 with req.auth set', async () => {
    const { auth, tokenFor } = fakeAuth({ user: approvedUser });
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/u`, tokenFor('user', 's1'));
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true, userId: 'user' });
    } finally { await srv.close(); }
});

test('old device (session no longer current) → 401 signed_in_elsewhere', async () => {
    const { auth, tokenFor } = fakeAuth({ user: { ...approvedUser, current_session_id: 's2' } });
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/u`, tokenFor('user', 's1'));
        assert.equal(res.status, 401);
        assert.equal((await res.json()).code, 'signed_in_elsewhere');
    } finally { await srv.close(); }
});

test('refetches once before rejecting a stale session (new device, stale cache)', async () => {
    const { auth, profiles, tokenFor } = fakeAuth({ user: approvedUser });
    const srv = await serve(auth);
    try {
        assert.equal((await get(`${srv.url}/u`, tokenFor('user', 's1'))).status, 200); // caches s1
        profiles.db.set('user', { ...approvedUser, current_session_id: 's2' });      // user signs in on device 2
        const res = await get(`${srv.url}/u`, tokenFor('user', 's2'));
        assert.equal(res.status, 200);
        assert.deepEqual(profiles.busted, ['user']);
    } finally { await srv.close(); }
});

test('non-admin on admin route → 403 forbidden; admin → 200', async () => {
    const { auth, tokenFor } = fakeAuth({ user: approvedUser, admin: approvedAdmin });
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/a`, tokenFor('user'));
        assert.equal(res.status, 403);
        assert.equal((await res.json()).code, 'forbidden');
        assert.equal((await get(`${srv.url}/a`, tokenFor('admin'))).status, 200);
    } finally { await srv.close(); }
});

test('profile lookup failure → 503 auth_unavailable (not 401)', async () => {
    const auth = createAuthMiddleware({
        verify: async () => ({ userId: 'user', sessionId: 's1' }),
        profiles: { get: async () => { throw new Error('supabase down'); }, bust() {} },
    });
    const srv = await serve(auth);
    try {
        const res = await get(`${srv.url}/u`, 'anything');
        assert.equal(res.status, 503);
        assert.equal((await res.json()).code, 'auth_unavailable');
    } finally { await srv.close(); }
});
