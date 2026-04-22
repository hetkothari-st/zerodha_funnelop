import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const ZERODHA_API_KEY = process.env.ZERODHA_API_KEY || '';
const ZERODHA_API_SECRET = process.env.ZERODHA_API_SECRET || '';

// In-memory Kite token — seeded from env, refreshed via /kite/callback
const kiteConfig = {
    accessToken: process.env.ZERODHA_ACCESS_TOKEN || '',
};

// ===================== SESSION TRACKING =====================
const activeSessions = new Map();

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ===================== SUPABASE HELPER =====================
async function validateCredentials(username, password) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error('[auth] SUPABASE_URL or SUPABASE_SERVICE_KEY not configured');
        return { ok: false, error: 'Server auth not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.' };
    }

    try {
        const url = `${SUPABASE_URL}/rest/v1/app_users?username=eq.${encodeURIComponent(username)}&is_active=eq.true&select=username,password`;
        console.log(`[auth] Querying Supabase for user: ${username}`);

        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`[auth] Supabase query failed: ${res.status} ${body}`);
            return { ok: false, error: 'Authentication service unavailable.' };
        }

        const rows = await res.json();
        console.log(`[auth] Supabase returned ${rows.length} row(s) for user: ${username}`);

        if (rows.length === 0) {
            return { ok: false, error: 'Invalid username or password.' };
        }

        const user = rows[0];
        if (user.password !== password) {
            console.log(`[auth] Password mismatch for user: ${username}`);
            return { ok: false, error: 'Invalid username or password.' };
        }

        return { ok: true, user: { username: user.username } };
    } catch (err) {
        console.error(`[auth] Supabase request error:`, err.message);
        return { ok: false, error: 'Authentication service error. Try again.' };
    }
}

// ===================== EXPRESS APP =====================
const app = express();
app.use(express.json());
app.use(express.static(DIST_DIR));

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    console.log(`[auth] Login attempt: username=${username}`);

    if (!username || !password) {
        return res.json({ ok: false, error: 'Username and password are required.' });
    }

    const result = await validateCredentials(username, password);
    if (!result.ok) {
        console.log(`[auth] Login REJECTED for ${username}: ${result.error}`);
        return res.json(result);
    }

    const existing = activeSessions.get(username);
    if (existing) {
        console.log(`[auth] Replacing existing session for ${username}`);
        activeSessions.delete(username);
    }

    const sessionToken = generateSessionToken();
    activeSessions.set(username, { sessionToken, connectedAt: Date.now() });
    console.log(`[auth] Login SUCCESS for ${username} (active sessions: ${activeSessions.size})`);

    return res.json({ ok: true, user: result.user, sessionToken });
});

app.post('/api/logout', (req, res) => {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.json({ ok: false, error: 'No session token provided.' });

    for (const [username, session] of activeSessions) {
        if (session.sessionToken === sessionToken) {
            activeSessions.delete(username);
            console.log(`[auth] Logout SUCCESS for ${username} (active sessions: ${activeSessions.size})`);
            break;
        }
    }
    return res.json({ ok: true });
});

app.get('/api/active-sessions', (req, res) => {
    const sessions = [];
    for (const [username, session] of activeSessions) {
        sessions.push({
            username,
            connectedAt: new Date(session.connectedAt).toISOString(),
            durationMin: Math.round((Date.now() - session.connectedAt) / 60000),
        });
    }
    return res.json({ count: sessions.length, sessions });
});

app.post('/api/validate-session', (req, res) => {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.json({ ok: false });
    for (const [username, session] of activeSessions) {
        if (session.sessionToken === sessionToken) {
            return res.json({ ok: true, user: { username } });
        }
    }
    return res.json({ ok: false });
});

app.post('/api/force-logout', (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.json({ ok: false, error: 'Username required.' });
    if (activeSessions.has(username)) {
        activeSessions.delete(username);
        console.log(`[auth] Force-logout SUCCESS for ${username}`);
        return res.json({ ok: true, message: `${username} has been logged out.` });
    }
    return res.json({ ok: false, error: `${username} has no active session.` });
});

// ===================== ZERODHA OAUTH =====================
app.get('/kite/callback', async (req, res) => {
    const { request_token, status } = req.query;

    if (status !== 'success' || !request_token) {
        console.error('[kite] Callback failed:', req.query);
        return res.redirect('/?kite_error=callback_failed');
    }

    if (!ZERODHA_API_KEY || !ZERODHA_API_SECRET) {
        console.error('[kite] ZERODHA_API_KEY or ZERODHA_API_SECRET not set');
        return res.redirect('/?kite_error=not_configured');
    }

    try {
        const checksum = crypto
            .createHash('sha256')
            .update(ZERODHA_API_KEY + request_token + ZERODHA_API_SECRET)
            .digest('hex');

        const tokenRes = await fetch('https://api.kite.trade/session/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
            body: new URLSearchParams({ api_key: ZERODHA_API_KEY, request_token, checksum }),
        });

        const data = await tokenRes.json();
        if (data.status !== 'success' || !data.data?.access_token) {
            console.error('[kite] Token exchange failed:', JSON.stringify(data));
            return res.redirect('/?kite_error=token_exchange_failed');
        }

        kiteConfig.accessToken = data.data.access_token;
        console.log(`[kite] Access token exchanged (user: ${data.data.user_id})`);
        return res.redirect('/?kite_auth=success');
    } catch (err) {
        console.error('[kite] Token exchange error:', err.message);
        return res.redirect('/?kite_error=server_error');
    }
});

app.get('/api/kite-config', (req, res) => {
    return res.json({
        apiKey: ZERODHA_API_KEY,
        accessToken: kiteConfig.accessToken,
        configured: !!(ZERODHA_API_KEY && kiteConfig.accessToken),
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ===================== START =====================
app.listen(PORT, async () => {
    console.log(`[server] listening on :${PORT}`);
    console.log(`[server] static dir: ${DIST_DIR}`);
    console.log(`[server] supabase configured: ${!!(SUPABASE_URL && SUPABASE_SERVICE_KEY)}`);

    try {
        const res = await fetch('https://api.ipify.org');
        const ip = await res.text();
        console.log(`[server] outbound IP: ${ip}  <-- WHITELIST THIS AT ZERODHA`);
    } catch (e) {
        console.warn('[server] could not resolve outbound IP:', e.message);
    }
});
