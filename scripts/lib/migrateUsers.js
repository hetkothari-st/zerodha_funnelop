// Moves legacy app_users (plain-text password table) onto Supabase Auth. See docs/runbooks/auth-rollout.md.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function planMigration(rows) {
    const seen = new Set();
    const migrate = [];
    const manual = [];
    for (const row of rows) {
        if (!row.is_active) continue;
        const email = String(row.username ?? '').trim().toLowerCase();
        if (!EMAIL.test(email)) { manual.push({ username: row.username, reason: 'username is not an email' }); continue; }
        if (seen.has(email)) continue;
        seen.add(email);
        migrate.push({ email, name: email.split('@')[0], username: row.username });
    }
    return { migrate, manual };
}

export function createSupabaseAdmin({ url, serviceKey, fetchImpl = fetch }) {
    const base = url.replace(/\/$/, '');
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    async function call(path, init = {}) {
        const res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
        const text = await res.text();
        const body = text ? JSON.parse(text) : null;
        return { status: res.status, ok: res.ok, body };
    }
    return {
        async listLegacyUsers() {
            const r = await call('/rest/v1/app_users?select=username,is_active&is_active=eq.true');
            if (!r.ok) throw new Error(`legacy read failed: ${r.status}`);
            return r.body;
        },
        async createUser({ email, name }) {
            const r = await call('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: name } }) });
            if (r.ok) return { id: r.body.id, created: true };
            if (r.status === 422 || r.body?.code === 'email_exists') return { id: null, created: false };
            throw new Error(`create failed: ${r.status} ${r.body?.msg || r.body?.message || ''}`.trim());
        },
        async findUserIdByEmail(email) {
            for (let page = 1; page <= 50; page++) {
                const r = await call(`/auth/v1/admin/users?page=${page}&per_page=1000`);
                if (!r.ok) throw new Error(`list users failed: ${r.status}`);
                const hit = (r.body.users || []).find((u) => (u.email || '').toLowerCase() === email);
                if (hit) return hit.id;
                if (!r.body.users?.length) return null;
            }
            return null;
        },
        async approveProfile(id) {
            const r = await call(`/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH', headers: { Prefer: 'return=minimal' },
                body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() }),
            });
            if (!r.ok) throw new Error(`approve failed: ${r.status}`);
        },
        async sendPasswordSetEmail(email, redirectTo) {
            const r = await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: JSON.stringify({ email }) });
            if (!r.ok) throw new Error(`recover email failed: ${r.status}`);
        },
    };
}

export async function runMigration({ legacy, target, appOrigin, apply, log = console }) {
    const rows = await legacy.listLegacyUsers();
    const { migrate, manual } = planMigration(rows);
    const report = { dryRun: !apply, created: [], skipped_exists: [], failed: [], manual };
    for (const { email, name } of migrate) {
        if (!apply) { report.created.push(email); continue; }
        try {
            const { id, created } = await target.createUser({ email, name });
            const userId = id ?? await target.findUserIdByEmail(email);
            if (!userId) throw new Error('user exists but could not be found');
            await target.approveProfile(userId);
            if (created) {
                await target.sendPasswordSetEmail(email, `${appOrigin}/reset-password`);
                report.created.push(email);
            } else {
                report.skipped_exists.push(email);
            }
            log.info(`[migrate] ${created ? 'created' : 'exists '} ${email}`);
        } catch (err) {
            report.failed.push({ email, reason: err.message });
            log.error(`[migrate] FAILED ${email}: ${err.message}`);
        }
    }
    return report;
}
