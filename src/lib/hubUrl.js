export const HUB_CLOSE = { unauthenticated: 4401, notApproved: 4403, signedInElsewhere: 4409 };

export function hubUrlWithToken(base, token) {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
}

// What the market-data hook should do after the hub closes the socket.
export function reconnectPolicy(code) {
    if (code === HUB_CLOSE.signedInElsewhere) return 'displaced';
    if (code === HUB_CLOSE.notApproved) return 'stop';
    return 'retry';
}
