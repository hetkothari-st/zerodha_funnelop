import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarketData } from './useMarketData';

// A minimal fake WebSocket the hook can drive through its real lifecycle:
// CONNECTING -> (triggerOpen) -> OPEN -> (triggerClose/triggerMessage) ...
// `close()` mimics a *client*-initiated close (what the hook calls on
// cleanup/disable/replace) and — like a real socket — fires `onclose` unless
// the hook has already detached it first. `triggerClose()` simulates the
// *server* (ws-hub) closing the connection, used to drive app close codes
// such as 4401 without going through the client-close path.
class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        this.sent = [];
        FakeWebSocket.instances.push(this);
    }

    send(data) { this.sent.push(data); }

    close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ code: 1000, reason: 'client close' });
    }

    triggerOpen() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.({});
    }
    triggerMessage(data) {
        this.onmessage?.({ data });
    }
    triggerClose(code, reason = '') {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ code, reason });
    }
}

let OriginalWebSocket;

beforeEach(() => {
    OriginalWebSocket = globalThis.WebSocket;
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket;
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
});

// No VITE_WS_HUB_URL is set in this test env, so the hook falls back to
// `ws://${window.location.hostname}:8765` — jsdom's default hostname.
function renderMarketData(initialProps) {
    return renderHook(
        ({ enabled, accessToken }) => useMarketData(enabled, null, null, { accessToken }),
        { initialProps }
    );
}

describe('useMarketData lifecycle', () => {
    test('[Critical] does not reconnect after unmount even once the pending close event fires', () => {
        const { unmount } = renderMarketData({ enabled: true, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(1);

        act(() => { FakeWebSocket.instances[0].triggerOpen(); });

        act(() => { unmount(); });

        act(() => { vi.advanceTimersByTime(120000); });

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('[Important] opens exactly one socket when mounted with a token already present', () => {
        renderMarketData({ enabled: true, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('[Important] opens exactly one socket when the token arrives after mount', () => {
        const { rerender } = renderMarketData({ enabled: true, accessToken: null });
        expect(FakeWebSocket.instances).toHaveLength(0);

        rerender({ enabled: true, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('[Important] opens exactly one new socket when the user re-enables (Connect)', () => {
        const { rerender } = renderMarketData({ enabled: false, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(0);

        rerender({ enabled: true, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('[Important] backs off exponentially across repeated app-level closes without resetting on open', () => {
        renderMarketData({ enabled: true, accessToken: 'tok' });
        expect(FakeWebSocket.instances).toHaveLength(1);

        act(() => {
            FakeWebSocket.instances[0].triggerOpen();
            FakeWebSocket.instances[0].triggerClose(4401);
        });

        act(() => { vi.advanceTimersByTime(2999); });
        expect(FakeWebSocket.instances).toHaveLength(1);
        act(() => { vi.advanceTimersByTime(1); });
        expect(FakeWebSocket.instances).toHaveLength(2); // delay 1 = 3000ms

        act(() => {
            FakeWebSocket.instances[1].triggerOpen();
            FakeWebSocket.instances[1].triggerClose(4401);
        });

        act(() => { vi.advanceTimersByTime(5999); });
        expect(FakeWebSocket.instances).toHaveLength(2);
        act(() => { vi.advanceTimersByTime(1); });
        expect(FakeWebSocket.instances).toHaveLength(3); // delay 2 = 6000ms

        act(() => {
            FakeWebSocket.instances[2].triggerOpen();
            FakeWebSocket.instances[2].triggerClose(4401);
        });

        act(() => { vi.advanceTimersByTime(11999); });
        expect(FakeWebSocket.instances).toHaveLength(3);
        act(() => { vi.advanceTimersByTime(1); });
        expect(FakeWebSocket.instances).toHaveLength(4); // delay 3 = 12000ms
    });

    test('[Important] a received message resets the backoff before the next close', () => {
        renderMarketData({ enabled: true, accessToken: 'tok' });

        // First close (no message received): schedules the base 3000ms delay, attempt -> 1.
        act(() => {
            FakeWebSocket.instances[0].triggerOpen();
            FakeWebSocket.instances[0].triggerClose(4401);
        });
        act(() => { vi.advanceTimersByTime(3000); });
        expect(FakeWebSocket.instances).toHaveLength(2);

        // Second socket proves healthy by delivering a message before it closes again.
        // If the backoff had NOT reset, the next delay would be 6000ms (attempt 1); it must be 3000ms again.
        act(() => {
            FakeWebSocket.instances[1].triggerOpen();
            FakeWebSocket.instances[1].triggerMessage(new ArrayBuffer(1));
            FakeWebSocket.instances[1].triggerClose(4401);
        });

        act(() => { vi.advanceTimersByTime(2999); });
        expect(FakeWebSocket.instances).toHaveLength(2);
        act(() => { vi.advanceTimersByTime(1); });
        expect(FakeWebSocket.instances).toHaveLength(3);
    });

    test('[Minor] re-enabling resets the backoff counter', () => {
        const { rerender } = renderMarketData({ enabled: true, accessToken: 'tok' });

        act(() => {
            FakeWebSocket.instances[0].triggerOpen();
            FakeWebSocket.instances[0].triggerClose(4401); // schedules 3000ms, attempt -> 1
        });
        act(() => { vi.advanceTimersByTime(3000); });
        expect(FakeWebSocket.instances).toHaveLength(2);

        act(() => {
            FakeWebSocket.instances[1].triggerOpen();
            FakeWebSocket.instances[1].triggerClose(4401); // would schedule 6000ms, attempt -> 2
        });

        act(() => { rerender({ enabled: false, accessToken: 'tok' }); });
        act(() => { rerender({ enabled: true, accessToken: 'tok' }); });
        expect(FakeWebSocket.instances).toHaveLength(3); // re-enabling connects immediately, no timer wait

        act(() => {
            FakeWebSocket.instances[2].triggerOpen();
            FakeWebSocket.instances[2].triggerClose(4401); // must schedule 3000ms again, not 12000ms
        });

        act(() => { vi.advanceTimersByTime(2999); });
        expect(FakeWebSocket.instances).toHaveLength(3);
        act(() => { vi.advanceTimersByTime(1); });
        expect(FakeWebSocket.instances).toHaveLength(4);
    });
});

// ── Hub auth + close-code handling (shared by both products) ─────────────
function renderWithAuth(initialProps) {
    return renderHook(
        ({ enabled = true, accessToken, onSignedInElsewhere }) => useMarketData(enabled, null, null, { accessToken, onSignedInElsewhere }),
        { initialProps },
    );
}
const isClosedOrClosing = (sock) => sock.readyState === FakeWebSocket.CLOSING || sock.readyState === FakeWebSocket.CLOSED;

describe('useMarketData — hub auth and close codes', () => {
    test('the socket URL carries the encoded access token', () => {
        renderWithAuth({ accessToken: 'a b/c+d=' });
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(FakeWebSocket.instances[0].url).toContain(`?token=${encodeURIComponent('a b/c+d=')}`);
    });

    test('close 4409 → onSignedInElsewhere, and no new socket after 120 s', () => {
        const onSignedInElsewhere = vi.fn();
        renderWithAuth({ accessToken: 'tok', onSignedInElsewhere });
        act(() => { FakeWebSocket.instances[0].triggerOpen(); });
        act(() => { FakeWebSocket.instances[0].triggerClose(4409); });
        expect(onSignedInElsewhere).toHaveBeenCalledTimes(1);
        act(() => { vi.advanceTimersByTime(120000); });
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('a {type:"signed_in_elsewhere"} text message → onSignedInElsewhere', () => {
        const onSignedInElsewhere = vi.fn();
        renderWithAuth({ accessToken: 'tok', onSignedInElsewhere });
        act(() => { FakeWebSocket.instances[0].triggerOpen(); });
        act(() => { FakeWebSocket.instances[0].triggerMessage(JSON.stringify({ type: 'signed_in_elsewhere' })); });
        expect(onSignedInElsewhere).toHaveBeenCalledTimes(1);
    });

    test('close 4403 → status error and no reconnect', () => {
        const { result } = renderWithAuth({ accessToken: 'tok' });
        act(() => { FakeWebSocket.instances[0].triggerOpen(); });
        act(() => { FakeWebSocket.instances[0].triggerClose(4403); });
        expect(result.current.status).toBe('error');
        act(() => { vi.advanceTimersByTime(120000); });
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(result.current.status).toBe('error');
    });

    test('losing the token closes the socket and does not reconnect', () => {
        const { rerender, result } = renderWithAuth({ accessToken: 'tok' });
        act(() => { FakeWebSocket.instances[0].triggerOpen(); });
        act(() => { rerender({ accessToken: null }); });
        expect(isClosedOrClosing(FakeWebSocket.instances[0])).toBe(true);
        expect(result.current.status).toBe('disconnected');
        act(() => { vi.advanceTimersByTime(120000); });
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});

describe('useMarketData — production hub URL warning', () => {
    afterEach(() => { vi.unstubAllEnvs(); });
    const hubWarnings = (spy) => spy.mock.calls.filter(([m]) => typeof m === 'string' && m.startsWith('[KiteWS] VITE_WS_HUB_URL not set'));

    test('no warning when VITE_WS_HUB_URL is set', () => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_WS_HUB_URL', 'wss://hub.example');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderWithAuth({ accessToken: 'tok' });
        expect(FakeWebSocket.instances[0].url).toContain('wss://hub.example');
        expect(hubWarnings(warn)).toHaveLength(0);
    });

    test('in production without VITE_WS_HUB_URL it warns once about the blocked fallback', () => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_WS_HUB_URL', '');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { rerender } = renderWithAuth({ accessToken: 'tok' });
        act(() => { rerender({ enabled: false, accessToken: 'tok' }); });
        act(() => { rerender({ enabled: true, accessToken: 'tok' }); });
        expect(FakeWebSocket.instances).toHaveLength(2);
        const w = hubWarnings(warn);
        expect(w).toHaveLength(1);
        expect(w[0][0]).toBe(`[KiteWS] VITE_WS_HUB_URL not set — falling back to ws://${window.location.hostname}:8765, which is blocked in production`);
    });
});
