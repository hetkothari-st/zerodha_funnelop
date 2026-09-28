export const OPEN_STATUSES = ['created', 'authenticated', 'active', 'pending'];
const SUB_FIELDS = 'user_id,razorpay_subscription_id,status,current_end,cancel_at_period_end,short_url,last_event_at';

// Service-key access to billing tables via PostgREST (bypasses RLS: server only).
export function createBillingStore({ supabaseUrl, serviceKey, fetchImpl = fetch, timeoutMs = 5000 }) {
    const baseHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

    async function call(path, init = {}) {
        const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
            ...init,
            headers: { ...baseHeaders, ...(init.headers || {}) },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`supabase ${init.method || 'GET'} ${path.split('?')[0]} failed: ${res.status}`);
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }
    const enc = encodeURIComponent;
    const first = (rows) => rows?.[0] ?? null;

    return {
        async entitlement(userId) {
            const rows = await call('rpc/entitlement', { method: 'POST', body: JSON.stringify({ uid: userId }) });
            return first(rows) ?? { plan: 'free', source: null, until: null };
        },
        async latestSubscription(userId) {
            return first(await call(`subscriptions?user_id=eq.${enc(userId)}&select=${SUB_FIELDS}&order=created_at.desc&limit=1`));
        },
        async openSubscription(userId) {
            return first(await call(`subscriptions?user_id=eq.${enc(userId)}&status=in.(${OPEN_STATUSES.join(',')})&select=${SUB_FIELDS}&limit=1`));
        },
        async getSubscription(subId) {
            return first(await call(`subscriptions?razorpay_subscription_id=eq.${enc(subId)}&select=${SUB_FIELDS}`));
        },
        async insertSubscription(userId, fields) {
            return first(await call('subscriptions', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify({ user_id: userId, ...fields }),
            }));
        },
        async updateSubscription(subId, patch) {
            return first(await call(`subscriptions?razorpay_subscription_id=eq.${enc(subId)}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
            }));
        },
        async recordEvent(eventId) {
            const rows = await call('billing_events', {
                method: 'POST',
                headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
                body: JSON.stringify({ event_id: eventId }),
            });
            return Array.isArray(rows) && rows.length > 0;
        },
        async forgetEvent(eventId) {
            await call(`billing_events?event_id=eq.${enc(eventId)}`, { method: 'DELETE' });
        },
    };
}
