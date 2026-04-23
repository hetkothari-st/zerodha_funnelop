import { useState, useEffect, useCallback, useRef } from 'react';
import { ZERODHA_CONFIG } from '../config/zerodha';
import instrumentMap from '../instrument_map.json';

// ─────────────────────────────────────────────────────────────────────
// Zerodha Kite Connect WebSocket — Binary Market Data Parser
// ─────────────────────────────────────────────────────────────────────
// Replaces the old JSON WebSocket with Zerodha's binary protocol.
// Normalizes all data into the same packet shape the app expects:
//   { Tkn, depths: [{ BP, BQ, SP, SQ }], _receivedAt, _type }
// ─────────────────────────────────────────────────────────────────────

// ── Binary Parsing Helpers ───────────────────────────────────────────

/**
 * Parse a single Zerodha binary tick packet.
 * Returns a normalized object matching the app's expected shape.
 *
 * Packet sizes:
 *   8 bytes   = LTP mode
 *   28 bytes  = Index quote
 *   32 bytes  = Index full
 *   44 bytes  = Quote mode (no depth)
 *   184 bytes = Full mode (with 5-level depth)
 */
function parseTickPacket(buffer) {
    const view = new DataView(buffer);
    const len = buffer.byteLength;

    const instrumentToken = view.getInt32(0);

    // All Zerodha prices are in paise — divide by 100
    const divisor = 100;

    // ── Index packet (28 or 32 bytes) ────────────────────────────
    if (len === 28 || len === 32) {
        const indexName = ZERODHA_CONFIG.INDEX_TOKENS[instrumentToken];
        // Map Zerodha instrument_token back to the old app tokens for indices
        let appToken = String(instrumentToken);
        if (indexName) {
            // Find the old token that maps to this index
            for (const [oldTkn, name] of Object.entries(ZERODHA_CONFIG.OLD_INDEX_MAP)) {
                if (name === indexName) { appToken = oldTkn; break; }
            }
        }

        return {
            Tkn: appToken,
            Token: appToken,
            Price: view.getInt32(4) / divisor,
            ltp: view.getInt32(4) / divisor,
            LastTradedPrice: view.getInt32(4) / divisor,
            High: view.getInt32(8) / divisor,
            Low: view.getInt32(12) / divisor,
            Open: view.getInt32(16) / divisor,
            Close: view.getInt32(20) / divisor,
            Change: view.getInt32(24) / divisor,
            _instrumentToken: instrumentToken,
            _type: 'IndexData',
            _receivedAt: Date.now(),
        };
    }

    // ── LTP packet (8 bytes) ─────────────────────────────────────
    if (len === 8) {
        return {
            Tkn: String(instrumentToken),
            Token: String(instrumentToken),
            ltp: view.getInt32(4) / divisor,
            _instrumentToken: instrumentToken,
            _type: 'LTP',
            _receivedAt: Date.now(),
        };
    }

    // ── Quote / Full packet (44 or 184 bytes) ────────────────────
    const packet = {
        Tkn: String(instrumentToken),
        Token: String(instrumentToken),
        ltp: view.getInt32(4) / divisor,
        LastTradedQty: view.getInt32(8),
        ATP: view.getInt32(12) / divisor,
        Volume: view.getInt32(16),
        TotalBuyQ: view.getInt32(20),
        TotalSellQ: view.getInt32(24),
        Open: view.getInt32(28) / divisor,
        High: view.getInt32(32) / divisor,
        Low: view.getInt32(36) / divisor,
        Close: view.getInt32(40) / divisor,
        _instrumentToken: instrumentToken,
        _type: len === 184 ? 'Depth' : 'Quote',
        _receivedAt: Date.now(),
    };

    // ── Full mode: parse 5-level market depth (bytes 64-183) ─────
    if (len === 184) {
        // Bytes 44-63: additional fields (timestamps, OI)
        packet.LastTradeTime = view.getInt32(44);
        packet.OI = view.getInt32(48);
        packet.OIDayHigh = view.getInt32(52);
        packet.OIDayLow = view.getInt32(56);
        packet.ExchangeTimestamp = view.getInt32(60);

        const depths = [];
        const depthOffset = 64;

        // 5 bid entries (bytes 64-123), then 5 ask entries (bytes 124-183)
        // Each entry: 4 bytes qty + 4 bytes price + 2 bytes orders + 2 bytes padding = 12 bytes
        for (let i = 0; i < 5; i++) {
            const bidBase = depthOffset + (i * 12);
            const askBase = depthOffset + 60 + (i * 12); // 60 = 5 bids * 12 bytes

            depths.push({
                BP: view.getInt32(bidBase + 4) / divisor,  // Bid Price
                BQ: view.getInt32(bidBase),                 // Bid Quantity
                BO: view.getInt16(bidBase + 8),             // Bid Orders
                SP: view.getInt32(askBase + 4) / divisor,  // Sell/Ask Price
                SQ: view.getInt32(askBase),                 // Sell/Ask Quantity
                SO: view.getInt16(askBase + 8),             // Sell/Ask Orders
            });
        }

        packet.depths = depths;
    }

    return packet;
}

/**
 * Parse a complete Zerodha WebSocket binary message frame.
 * Frame structure: 2 bytes (num packets) + for each: 2 bytes (length) + payload
 */
function parseBinaryMessage(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const packets = [];

    if (arrayBuffer.byteLength < 2) return packets;

    const numPackets = view.getInt16(0);
    let offset = 2;

    for (let i = 0; i < numPackets; i++) {
        if (offset + 2 > arrayBuffer.byteLength) break;

        const packetLen = view.getInt16(offset);
        offset += 2;

        if (offset + packetLen > arrayBuffer.byteLength) break;

        const packetBuffer = arrayBuffer.slice(offset, offset + packetLen);
        const parsed = parseTickPacket(packetBuffer);
        if (parsed) packets.push(parsed);

        offset += packetLen;
    }

    return packets;
}

// ── Token Mapping ────────────────────────────────────────────────────
// Maps between the app's exchange tokens (from contracts_nsefo.json)
// and Zerodha's instrument_tokens.
//
// Formula: instrument_token = exchange_token * 256 + exchange_code
// This is verified against Zerodha's instrument list.
// ─────────────────────────────────────────────────────────────────────

function exchangeTokenToInstrumentToken(exchangeToken, exchange = 'NFO') {
    const code = ZERODHA_CONFIG.EXCHANGE_CODES[exchange] || 2;
    return parseInt(exchangeToken) * 256 + code;
}

function instrumentTokenToExchangeToken(instrumentToken, exchange = 'NFO') {
    const code = ZERODHA_CONFIG.EXCHANGE_CODES[exchange] || 2;
    return Math.floor((instrumentToken - code) / 256);
}

// ── Main Hook ────────────────────────────────────────────────────────

export const useMarketData = (enabled = true, onMessage = null, onDepthPacket = null) => {
    const [status, setStatus] = useState('disconnected');
    const [depthData] = useState({}); // Kept for API compat — event bus handles all data

    const ws = useRef(null);
    const reconnectTimeout = useRef(null);
    const onMessageRef = useRef(onMessage);
    const onDepthPacketRef = useRef(onDepthPacket);
    const enabledRef = useRef(enabled);
    const isReady = useRef(false);
    const pendingSubs = useRef([]);

    // Token mapping: Zerodha instrument_token → app exchange_token (string)
    const tokenMap = useRef(new Map());         // instrumentToken → exchangeToken
    const reverseTokenMap = useRef(new Map());  // exchangeToken → instrumentToken

    // Subscription tracking
    const activeSubscriptions = useRef(new Map()); // exchangeToken → { Xchg, Tkn, Symbol }
    const lastPacketTimes = useRef(new Map());

    // Telemetry
    const packetRates = useRef({});
    const lastTelemetry = useRef(Date.now());

    // Keep refs updated
    useEffect(() => {
        onMessageRef.current = onMessage;
        onDepthPacketRef.current = onDepthPacket;
        enabledRef.current = enabled;
    }, [onMessage, onDepthPacket, enabled]);

    // ── Offline Instrument Map ──────────────────────────────────
    // Built from Zerodha's instruments CSV (instrument_map.json).
    // Maps exchange_token → instrument_token for all NFO/BFO instruments.
    // Also builds a reverse map (instrument_token → exchange_token).
    const instrumentMapLoaded = useRef(false);

    const loadInstrumentMap = useCallback(() => {
        if (instrumentMapLoaded.current) return;

        // instrumentMap is { "62714": 16054786, "882062": 225807877, ... }
        let count = 0;
        for (const [exchToken, instToken] of Object.entries(instrumentMap)) {
            reverseTokenMap.current.set(exchToken, instToken);
            tokenMap.current.set(instToken, exchToken);
            count++;
        }
        console.log(`[KiteWS] Loaded ${count} instrument mappings from offline map`);
        instrumentMapLoaded.current = true;
    }, []);

    // ── Resolve app token → Zerodha instrument_token ─────────────
    const resolveInstrumentToken = useCallback((exchangeToken, exchange = 'NFO') => {
        // Check if we have it from the instrument list
        const fromMap = reverseTokenMap.current.get(String(exchangeToken));
        if (fromMap) return fromMap;

        // Check if it's an index
        const indexName = ZERODHA_CONFIG.OLD_INDEX_MAP[String(exchangeToken)];
        if (indexName) {
            return ZERODHA_CONFIG.INDEX_TOKEN_BY_NAME[indexName];
        }

        // Fallback: formula-based mapping
        return exchangeTokenToInstrumentToken(exchangeToken, exchange);
    }, []);

    // ── Resolve Zerodha instrument_token → app exchange token ────
    const resolveAppToken = useCallback((instrumentToken) => {
        // Check index tokens first
        const indexName = ZERODHA_CONFIG.INDEX_TOKENS[instrumentToken];
        if (indexName) {
            for (const [oldTkn, name] of Object.entries(ZERODHA_CONFIG.OLD_INDEX_MAP)) {
                if (name === indexName) return oldTkn;
            }
        }

        // Check instrument list map
        const fromMap = tokenMap.current.get(instrumentToken);
        if (fromMap) return fromMap;

        // Fallback: reverse formula
        return String(instrumentTokenToExchangeToken(instrumentToken));
    }, []);

    // ── Connect ──────────────────────────────────────────────────
    const connect = useCallback(() => {
        // If VITE_WS_HUB_URL is set, connect to the shared local hub instead of
        // Zerodha directly — the hub holds the single Zerodha connection.
        const hubUrl = import.meta.env.VITE_WS_HUB_URL || null;

        if (!hubUrl) {
            const { API_KEY, ACCESS_TOKEN } = ZERODHA_CONFIG;
            if (!API_KEY || !ACCESS_TOKEN) {
                console.error('[KiteWS] Missing API_KEY or ACCESS_TOKEN and no VITE_WS_HUB_URL set');
                setStatus('error');
                return;
            }
        }

        if (ws.current) {
            ws.current.onclose = null;
            ws.current.close();
        }

        // Load offline instrument map (synchronous, from bundled JSON)
        loadInstrumentMap();

        const { API_KEY, ACCESS_TOKEN, WS_URL } = ZERODHA_CONFIG;
        const url = hubUrl || `${WS_URL}?api_key=${API_KEY}&access_token=${ACCESS_TOKEN}`;
        console.log('[KiteWS] Connecting...');
        setStatus('connecting');

        ws.current = new WebSocket(url);
        ws.current.binaryType = 'arraybuffer';

        ws.current.onopen = () => {
            console.log('[KiteWS] Connected');
            setStatus('connected');
            isReady.current = true;

            // Re-subscribe all active tokens + flush pending
            const allTokens = [
                ...Array.from(activeSubscriptions.current.values()),
                ...pendingSubs.current.flat()
            ];

            if (allTokens.length > 0) {
                const instrumentTokens = allTokens.map(q => {
                    const exchange = (q.Xchg === 'NSE' || q.Xchg === 'BSE') ? q.Xchg : 'NFO';
                    return resolveInstrumentToken(q.Tkn, exchange);
                }).filter(Boolean);

                // Always subscribe to index tokens
                const indexTokens = [256265, 260105, 265]; // NIFTY, BANKNIFTY, SENSEX
                const allInstrumentTokens = [...new Set([...instrumentTokens, ...indexTokens])];

                if (allInstrumentTokens.length > 0) {
                    ws.current.send(JSON.stringify({ a: 'subscribe', v: allInstrumentTokens }));
                    ws.current.send(JSON.stringify({ a: 'mode', v: ['full', allInstrumentTokens] }));
                    console.log(`[KiteWS] Subscribed ${allInstrumentTokens.length} tokens in full mode`);
                }

                allTokens.forEach(q => activeSubscriptions.current.set(String(q.Tkn), q));
            } else {
                // Subscribe to indices at minimum
                const indexTokens = [256265, 260105, 265];
                ws.current.send(JSON.stringify({ a: 'subscribe', v: indexTokens }));
                ws.current.send(JSON.stringify({ a: 'mode', v: ['full', indexTokens] }));
                console.log('[KiteWS] Subscribed to indices');
            }

            pendingSubs.current = [];

            // Zerodha handles keep-alive via native WebSocket pings — no heartbeat needed

            if (onMessageRef.current) {
                onMessageRef.current('Login', { Error: null });
            }
        };

        ws.current.onmessage = (event) => {
            try {
                // ── Text message (JSON) — order updates, errors ──
                if (typeof event.data === 'string') {
                    const text = event.data.trim();
                    // Ignore heartbeats, empty strings, and non-JSON
                    if (!text || !text.startsWith('{')) return;

                    try {
                        const msg = JSON.parse(text);
                        if (msg.type === 'error') {
                            console.error('[KiteWS] Error:', msg.data);
                            if (onMessageRef.current) onMessageRef.current('Error', msg.data);
                        } else if (msg.type === 'order') {
                            if (onMessageRef.current) onMessageRef.current('Order', msg.data);
                        }
                    } catch (e) {
                        // Non-JSON text message, ignore
                    }
                    return;
                }

                // ── Binary message — market data ticks ───────────
                if (event.data instanceof ArrayBuffer) {
                    // 1-byte = heartbeat
                    if (event.data.byteLength <= 1) return;

                    const packets = parseBinaryMessage(event.data);

                    packets.forEach(packet => {
                        const instrumentToken = packet._instrumentToken;

                        // Resolve back to app's exchange token
                        const appToken = resolveAppToken(instrumentToken);
                        packet.Tkn = appToken;
                        packet.Token = appToken;

                        const tknStr = String(appToken);
                        lastPacketTimes.current.set(tknStr, Date.now());

                        // Telemetry
                        packetRates.current[tknStr] = (packetRates.current[tknStr] || 0) + 1;

                        // Dispatch to event bus (for DepthCards and audio alerts)
                        if (packet._type === 'Depth' && onDepthPacketRef.current) {
                            onDepthPacketRef.current(packet);
                        }

                        // Index data also dispatched (for spot price tracking)
                        if (packet._type === 'IndexData' && onDepthPacketRef.current) {
                            onDepthPacketRef.current(packet);
                        }
                    });

                    // Telemetry log every 5 seconds
                    if (Date.now() - lastTelemetry.current > 5000) {
                        const stats = packetRates.current;
                        const total = Object.values(stats).reduce((a, b) => a + b, 0);
                        if (total > 0) {
                            console.log('[KiteWS] 5s Traffic:', JSON.stringify(stats));
                        }
                        packetRates.current = {};
                        lastTelemetry.current = Date.now();
                    }
                }
            } catch (err) {
                // Only log actual processing errors, not parse/heartbeat noise
                if (err?.message && !err.message.includes('JSON')) {
                    console.error('[KiteWS] Message Error:', err);
                }
            }
        };

        ws.current.onclose = (event) => {
            console.warn(`[KiteWS] Closed: ${event.code} - ${event.reason || 'Unknown'}`);
            setStatus('disconnected');
            isReady.current = false;

            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);

            if (enabledRef.current) {
                console.warn('[KiteWS] Reconnecting in 3s...');
                reconnectTimeout.current = setTimeout(connect, 3000);
            }
        };

        ws.current.onerror = (err) => {
            console.error('[KiteWS] WebSocket error:', err);
            setStatus('error');
        };

    }, [loadInstrumentMap, resolveInstrumentToken, resolveAppToken]);

    // ── Watchdog: resubscribe stale tokens ───────────────────────
    useEffect(() => {
        if (!enabled) return;

        const watchdog = setInterval(() => {
            if (ws.current?.readyState !== WebSocket.OPEN || !isReady.current) return;
            if (activeSubscriptions.current.size === 0) return;

            const now = Date.now();
            const staleTokens = [];

            activeSubscriptions.current.forEach((quote, tkn) => {
                const lastTime = lastPacketTimes.current.get(String(tkn)) || 0;
                if (now - lastTime > 30000) {
                    const exchange = (quote.Xchg === 'NSE' || quote.Xchg === 'BSE') ? quote.Xchg : 'NFO';
                    const instToken = resolveInstrumentToken(tkn, exchange);
                    if (instToken) staleTokens.push(instToken);
                    lastPacketTimes.current.set(String(tkn), now);
                }
            });

            if (staleTokens.length > 0) {
                console.warn('[KiteWS] Watchdog resubscribing:', staleTokens.length, 'stale tokens');
                ws.current.send(JSON.stringify({ a: 'subscribe', v: staleTokens }));
                ws.current.send(JSON.stringify({ a: 'mode', v: ['full', staleTokens] }));
            }
        }, 15000);

        return () => clearInterval(watchdog);
    }, [enabled, resolveInstrumentToken]);

    // ── Subscribe Function (same API as before) ──────────────────
    // Accepts: [{ Xchg: 'NSEFO', Tkn: '62714', Symbol: 'NIFTY ...' }]
    const subscribe = useCallback((quotes, feedType = 2) => {
        // Track locally
        quotes.forEach(q => {
            const tknStr = String(q.Tkn);
            activeSubscriptions.current.set(tknStr, q);
            lastPacketTimes.current.set(tknStr, Date.now());
        });

        if (ws.current?.readyState === WebSocket.OPEN && isReady.current) {
            const instrumentTokens = quotes.map(q => {
                const exchange = q.Xchg === 'NSEFO' ? 'NFO' : q.Xchg === 'BSEFO' ? 'BFO' : q.Xchg;
                return resolveInstrumentToken(q.Tkn, exchange);
            }).filter(Boolean);

            if (instrumentTokens.length > 0) {
                ws.current.send(JSON.stringify({ a: 'subscribe', v: instrumentTokens }));
                ws.current.send(JSON.stringify({ a: 'mode', v: ['full', instrumentTokens] }));
                console.log('[KiteWS] Subscribed:', instrumentTokens.length, 'tokens');
            }
        } else {
            console.log('[KiteWS] Not ready, queueing:', quotes.length, 'tokens');
            pendingSubs.current.push(quotes);
        }
    }, [resolveInstrumentToken]);

    // ── Init Effect ──────────────────────────────────────────────
    useEffect(() => {
        if (enabled) {
            connect();
        } else {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = null;
            }
            setStatus('disconnected');
        }
        return () => {
            if (ws.current) ws.current.close();
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        };
    }, [enabled, connect]);

    return { status, depthData, subscribe };
};
