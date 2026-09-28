// Creates fully-verified users through the Supabase Admin API so no inbox/SMS is needed.
export function adminApi({ supabaseUrl, serviceKey, emailDomain, runId }) {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    let n = 0;
    async function call(path, init = {}) {
        const res = await fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
        const text = await res.text();
        if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text}`);
        return text ? JSON.parse(text) : null;
    }
    return {
        async createVerifiedUser({ role = 'user', status = 'approved', withPhone = true } = {}) {
            n += 1;
            const email = `e2e+${runId}-${n}@${emailDomain}`;
            const password = `E2e-${runId}-${n}-pass1`;
            const phone = withPhone ? `+9198${String(Date.now()).slice(-6)}${String(n).padStart(2, '0')}` : undefined;
            const user = await call('/auth/v1/admin/users', {
                method: 'POST',
                body: JSON.stringify({ email, password, email_confirm: true, ...(phone ? { phone, phone_confirm: true } : {}), user_metadata: { full_name: `E2E ${n}` } }),
            });
            await call(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, role }) });
            return { id: user.id, email, password };
        },
        async setStatus(id, status) {
            await call(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status }) });
        },
        async deleteUser(id) {
            await call(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
        },
        async deleteRunUsers(prefix = `e2e+${runId}-`) {
            const r = await call('/auth/v1/admin/users?page=1&per_page=1000');
            const mine = (r.users || []).filter((u) => (u.email || '').startsWith(prefix));
            for (const u of mine) await call(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
            return mine.length;
        },
    };
}
