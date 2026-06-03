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
app.get('/kite/login', (req, res) => {
    if (!ZERODHA_API_KEY) {
        return res.status(400).send('ZERODHA_API_KEY not configured in .env');
    }
    const redirectUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${ZERODHA_API_KEY}`;
    res.redirect(redirectUrl);
});

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
        
        // Update ws-hub dynamically
        try {
            await fetch(`${process.env.WS_HUB_URL || 'http://127.0.0.1:8765'}/api/update-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: data.data.access_token })
            });
            console.log('[kite] ws-hub notified of new token');
        } catch (err) {
            console.warn('[kite] Could not notify ws-hub (is it running?):', err.message);
        }
        return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Zerodha Auth</title>
<style>body{background:#050505;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
.ok{color:#4ade80;font-size:1.2rem;font-weight:bold}.sub{color:#ffffff60;font-size:.8rem}</style></head>
<body><div class="ok">✓ Zerodha connected</div>
<div class="sub">Token exchanged. Returning to launcher…</div>
<script>if(window.opener)window.opener.postMessage('zerodha_connected','*');setTimeout(()=>window.close(),1500)</script></body></html>`);
    } catch (err) {
        console.error('[kite] Token exchange error:', err.message);
        return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Auth Error</title>
<style>body{background:#050505;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head>
<body style="color:#f87171">Auth error: ${err.message}</body></html>`);
    }
});

app.post('/api/set-access-token', async (req, res) => {
    const { access_token } = req.body || {};
    if (!access_token) return res.json({ ok: false, error: 'access_token required' });

    kiteConfig.accessToken = access_token;
    console.log('[kite] Access token set directly');

    try {
        await fetch(`${process.env.WS_HUB_URL || 'http://127.0.0.1:8765'}/api/update-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token }),
        });
        console.log('[kite] ws-hub notified');
    } catch (err) {
        console.warn('[kite] Could not notify ws-hub:', err.message);
    }

    return res.json({ ok: true, access_token });
});

app.post('/api/exchange-token', async (req, res) => {
    const { request_token } = req.body || {};
    if (!request_token) return res.json({ ok: false, error: 'request_token required' });
    if (!ZERODHA_API_KEY || !ZERODHA_API_SECRET)
        return res.json({ ok: false, error: 'ZERODHA_API_KEY or ZERODHA_API_SECRET not configured' });

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
        if (data.status !== 'success' || !data.data?.access_token)
            return res.json({ ok: false, error: data.message || 'Token exchange failed' });

        kiteConfig.accessToken = data.data.access_token;
        console.log(`[kite] Token exchanged via API (user: ${data.data.user_id})`);

        try {
            await fetch(`${process.env.WS_HUB_URL || 'http://127.0.0.1:8765'}/api/update-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: data.data.access_token }),
            });
        } catch (_) {}

        return res.json({ ok: true, access_token: data.data.access_token });
    } catch (err) {
        console.error('[kite] exchange-token error:', err.message);
        return res.json({ ok: false, error: err.message });
    }
});

app.get('/api/kite-config', (req, res) => {
    return res.json({
        apiKey: ZERODHA_API_KEY,
        accessToken: kiteConfig.accessToken,
        configured: !!(ZERODHA_API_KEY && kiteConfig.accessToken),
    });
});

app.get('/connect', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Funnel Launcher</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050505;color:#e0e0e0;font-family:'Courier New',monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;padding:2rem}
h1{font-size:.78rem;color:#ffffff25;letter-spacing:.35em;text-transform:uppercase}
.row{display:flex;align-items:center;gap:.75rem;font-size:.95rem}
.dot{width:9px;height:9px;border-radius:50%;background:#f87171;flex-shrink:0;transition:background .4s}
.dot.ok{background:#4ade80}
.dot.spin{background:#facc15;animation:blink .9s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
button{background:#111;border:1px solid #252525;color:#bbb;padding:.65rem 1.4rem;font-family:inherit;font-size:.82rem;cursor:pointer;letter-spacing:.06em;transition:all .15s}
button:hover{background:#1c1c1c;border-color:#3a3a3a;color:#fff}
button:disabled{opacity:.3;cursor:not-allowed}
.apps{display:none;flex-direction:column;gap:.55rem;width:100%;max-width:300px}
.app-link{display:flex;justify-content:space-between;align-items:center;padding:.6rem .9rem;background:#0c0c0c;border:1px solid #191919;color:#4ade80;text-decoration:none;font-size:.8rem;transition:all .15s}
.app-link:hover{border-color:#4ade80;background:#061206}
.port{color:#ffffff20;font-size:.72rem}
.note{font-size:.7rem;color:#ffffff25;text-align:center;line-height:1.8}
</style>
</head>
<body>
<h1>Funnel Launcher</h1>
<div class="row"><div class="dot" id="dot"></div><span id="msg">Checking&hellip;</span></div>
<button id="btn" onclick="login()" style="display:none">Connect Zerodha &nearr;</button>
<div class="apps" id="apps">
  <a class="app-link" id="op" href="#" target="_blank">funnel_op <span class="port">:5191 &rarr;</span></a>
  <a class="app-link" id="eq" href="#" target="_blank">funnel_eq <span class="port">:5292 &rarr;</span></a>
</div>
<p class="note" id="note"></p>
<script>
var H=location.hostname,ok=false,popup=null;
function note(t){document.getElementById('note').textContent=t;}
async function poll(){
  try{
    var d=await fetch('/api/kite-config').then(function(r){return r.json();});
    if(d.configured){setOk();}else{setWait();}
  }catch(e){setWait();}
}
function setOk(){
  if(ok)return;ok=true;
  document.getElementById('dot').className='dot ok';
  document.getElementById('msg').textContent='✓ Zerodha connected';
  document.getElementById('btn').style.display='none';
  var apps=document.getElementById('apps');apps.style.display='flex';
  document.getElementById('op').href='http://'+H+':5191';
  document.getElementById('eq').href='http://'+H+':5292';
  note('Opening apps…');
  setTimeout(function(){
    window.open('http://'+H+':5191','funnel_op');
    setTimeout(function(){window.open('http://'+H+':5292','funnel_eq');},500);
    note('');
  },700);
}
function setWait(){
  if(ok)return;
  document.getElementById('dot').className='dot';
  document.getElementById('msg').textContent='Zerodha not connected';
  var b=document.getElementById('btn');b.style.display='block';b.disabled=false;b.textContent='Connect Zerodha ↗';
}
function login(){
  var b=document.getElementById('btn');b.disabled=true;b.textContent='Waiting…';
  document.getElementById('dot').className='dot spin';
  document.getElementById('msg').textContent='Login in progress…';
  popup=window.open('/kite/login','zerodha','width=560,height=680,left=200,top=80');
  if(!popup){note('Popup blocked — allow popups for this site and retry.');setWait();return;}
  var t=setInterval(function(){if(popup&&popup.closed){clearInterval(t);if(!ok)setWait();}},800);
}
window.addEventListener('message',function(e){if(e.data==='zerodha_connected'){if(popup)popup.close();poll();}});
setInterval(poll,2500);poll();
</script>
</body>
</html>`);
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
