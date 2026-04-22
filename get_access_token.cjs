#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────
// Zerodha Access Token Generator
// ─────────────────────────────────────────────────────────────────────
// Exchanges a request_token for an access_token.
//
// Usage:
//   node get_access_token.cjs <api_key> <api_secret> <request_token>
//
// Steps:
//   1. Open this URL in your browser (replace YOUR_API_KEY):
//      https://kite.zerodha.com/connect/login?v=3&api_key=YOUR_API_KEY
//
//   2. Login with your Zerodha credentials
//
//   3. After login, you'll be redirected to your redirect URL with
//      ?request_token=XXXXX in the URL bar. Copy that value.
//
//   4. Run: node get_access_token.cjs <api_key> <api_secret> <request_token>
//
//   5. Paste the access_token into src/config/zerodha.js
//
// Note: access_token is valid for 1 trading day (resets at ~6 AM IST).
//       You need to repeat this process each morning.
// ─────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const https = require('https');

const [,, apiKey, apiSecret, requestToken] = process.argv;

if (!apiKey || !apiSecret || !requestToken) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Zerodha Access Token Generator                      ║
╚══════════════════════════════════════════════════════════════╝

Step 1: Open this URL in your browser:
  https://kite.zerodha.com/connect/login?v=3&api_key=YOUR_API_KEY

Step 2: Login with your Zerodha credentials

Step 3: Copy the request_token from the redirect URL:
  http://127.0.0.1:3000/callback?request_token=THIS_VALUE&action=login

Step 4: Run this script:
  node get_access_token.cjs <api_key> <api_secret> <request_token>

Example:
  node get_access_token.cjs abc123 def456 xyz789
`);
    process.exit(1);
}

// Generate checksum: SHA-256 of (api_key + request_token + api_secret)
const checksum = crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');

const postData = `api_key=${encodeURIComponent(apiKey)}&request_token=${encodeURIComponent(requestToken)}&checksum=${encodeURIComponent(checksum)}`;

const options = {
    hostname: 'api.kite.trade',
    port: 443,
    path: '/session/token',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'X-Kite-Version': '3',
    },
};

const req = https.request(options, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
            const data = JSON.parse(body);

            if (data.status === 'success' && data.data?.access_token) {
                const token = data.data.access_token;
                console.log(`
╔══════════════════════════════════════════════════════════════╗
║  SUCCESS! Your access_token:                                 ║
╚══════════════════════════════════════════════════════════════╝

  ${token}

Paste this into src/config/zerodha.js:

  API_KEY: '${apiKey}',
  ACCESS_TOKEN: '${token}',

Note: This token expires daily at ~6 AM IST.
`);
            } else {
                console.error('Error:', data.message || JSON.stringify(data));
            }
        } catch (e) {
            console.error('Response:', body);
        }
    });
});

req.on('error', (e) => console.error('Request failed:', e.message));
req.write(postData);
req.end();
