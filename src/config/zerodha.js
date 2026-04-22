// ─────────────────────────────────────────────────────────────────────
// Zerodha Kite Connect Configuration
// ─────────────────────────────────────────────────────────────────────
// Fill in your API key and access token from https://developers.kite.trade/
//
// How to get credentials:
//   1. Sign up at https://developers.kite.trade/
//   2. Create an app → you get api_key and api_secret
//   3. Complete login flow → you get access_token (valid for 1 day)
// ─────────────────────────────────────────────────────────────────────

export const ZERODHA_CONFIG = {
    API_KEY: import.meta.env.VITE_ZERODHA_API_KEY || '',
    ACCESS_TOKEN: import.meta.env.VITE_ZERODHA_ACCESS_TOKEN || '',

    // WebSocket endpoint (do not change)
    WS_URL: 'wss://ws.kite.trade',

    // REST API base (for fetching instrument list)
    API_BASE: 'https://api.kite.trade',

    // Well-known index instrument_tokens (these are fixed by Zerodha)
    INDEX_TOKENS: {
        256265: 'NIFTY 50',     // NSE NIFTY 50
        260105: 'NIFTY BANK',   // NSE NIFTY BANK
        265:    'SENSEX',        // BSE SENSEX
    },

    // Reverse map: name → instrument_token (for subscribing to indices)
    INDEX_TOKEN_BY_NAME: {
        'NIFTY 50': 256265,
        'NIFTY50': 256265,
        'NIFTY': 256265,
        'NIFTY BANK': 260105,
        'NIFTYBANK': 260105,
        'BANKNIFTY': 260105,
        'SENSEX': 265,
    },

    // Exchange codes used in instrument_token calculation
    // instrument_token = exchange_token * 256 + exchange_code
    // Verified from actual Zerodha instrument CSV (modulo 256)
    EXCHANGE_CODES: {
        NSE: 9,   // Verified: 256265 % 256 = 9
        NFO: 2,   // Verified: 16054786 % 256 = 2
        BSE: 4,   // Verified: 128000516 % 256 = 4
        BFO: 5,   // Verified: 211574533 % 256 = 5
        MCX: 9,   // Verified: 273417 % 256 = 9
        CDS: 3,   // Verified: 1678083 % 256 = 3
        NSEFO: 2, // Alias for NFO
        BSEFO: 5, // Alias for BFO
    },

    // Old WS token → Zerodha index mapping
    // The old server used these tokens for indices
    OLD_INDEX_MAP: {
        '26000': 'NIFTY 50',    // Old NIFTY token
        '26009': 'NIFTY BANK',  // Old BANKNIFTY token
        '1': 'SENSEX',          // Old SENSEX token
    },
};
