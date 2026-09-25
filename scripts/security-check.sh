#!/usr/bin/env bash
# Asserts the public surface of a Funnel server (and optionally ws-hub) is locked down.
# Usage: scripts/security-check.sh https://funnel-op-staging.up.railway.app [https://ws-hub-staging.up.railway.app]
set -u
BASE="${1:?usage: security-check.sh <app-base-url> [hub-base-url]}"
HUB="${2:-}"
fail=0

expect() { # METHOD PATH EXPECTED_STATUS
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json' --data '{}')
    if [ "$code" = "$3" ]; then echo "ok   $1 $2 -> $code"; else echo "FAIL $1 $2 -> $code (expected $3)"; fail=1; fi
}

expect GET  /api/kite-config            401
expect POST /api/set-access-token       401
expect POST /api/exchange-token         401
expect POST /api/admin/kite/login-url   401
expect GET  /api/admin/users            401
expect POST /api/login                  404
expect POST /api/force-logout           404
expect GET  /api/active-sessions        404

if curl -s "$BASE/api/kite-config" | grep -q accessToken; then echo "FAIL /api/kite-config mentions accessToken"; fail=1; else echo "ok   /api/kite-config has no token"; fi
if curl -s "$BASE/connect" | grep -q "Funnel Launcher"; then echo "FAIL /connect launcher still served"; fail=1; else echo "ok   /connect launcher gone"; fi

loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/kite/callback?request_token=x&status=success")
case "$loc" in
    *kite=expired*) echo "ok   /kite/callback without state refused" ;;
    *) echo "FAIL /kite/callback without state -> '$loc'"; fail=1 ;;
esac

if curl -sI "$BASE/" | grep -qi "content-security-policy:.*frame-ancestors 'none'"; then echo "ok   CSP frame-ancestors none"; else echo "FAIL CSP header missing"; fail=1; fi

if [ -n "$HUB" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$HUB/api/update-token" --data '{"access_token":"x"}')
    if [ "$code" = "401" ]; then echo "ok   hub update-token requires secret"; else echo "FAIL hub update-token -> $code"; fail=1; fi
    code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
        -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' "$HUB/")
    if [ "$code" = "403" ]; then echo "ok   hub rejects foreign origin"; else echo "FAIL hub foreign origin -> $code"; fail=1; fi
fi

exit $fail
