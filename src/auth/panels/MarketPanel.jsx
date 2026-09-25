import React, { useEffect, useMemo, useState } from 'react';
import { useLiveMotion } from './useLiveMotion';

const W = 600, H = 540, STEP = 8, N = Math.floor(W / STEP);
const mono = "font-['JetBrains_Mono',monospace]";

// Deterministic pseudo-random so the static frame is stable (and tests are stable).
function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function initialSeries() {
    const rand = seeded(42);
    const pts = []; let p = H * 0.55;
    for (let i = 0; i < N; i++) {
        p += (Math.sin(i * 0.37) + Math.cos(i * 0.13)) * 2 + (rand() - 0.5) * 6;
        pts.push(Math.max(H * 0.2, Math.min(H * 0.8, p)));
    }
    return pts;
}

const fmt = (n, d = 2) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

// Illustrative streaming NIFTY chart for the Funnel Op auth screens (spec §3.1). Not real market data.
export default function MarketPanel({ compact = false }) {
    const live = useLiveMotion();
    const [pts, setPts] = useState(initialSeries);
    const rand = useMemo(() => seeded(7), []);

    useEffect(() => {
        if (!live) return undefined;
        const id = setInterval(() => {
            setPts((prev) => {
                const last = prev[prev.length - 1];
                const next = Math.max(H * 0.2, Math.min(H * 0.8, last + (rand() - 0.48) * 9));
                return [...prev.slice(1), next];
            });
        }, 700);
        return () => clearInterval(id);
    }, [live, rand]);

    const ly = pts[pts.length - 1];
    const lx = (pts.length - 1) * STEP;
    const price = 24612.45 + (H * 0.55 - ly) * 1.1;
    const ltp = 142.35 + (H * 0.5 - ly) * 0.12;
    const pnl = Math.round((ltp - 128.2) * 150);
    const line = pts.map((v, i) => `${i * STEP},${v.toFixed(1)}`).join(' ');
    const area = `M0 ${H} ${pts.map((v, i) => `L${i * STEP} ${v.toFixed(1)}`).join(' ')} L${lx} ${H}Z`;

    return (
        <div className="absolute inset-0 bg-[#04060a] text-slate-200">
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => <line key={`g${i}`} x1="0" x2={W} y1={(i + 1) * (H / 9)} y2={(i + 1) * (H / 9)} stroke="#ffffff08" />)}
                {Array.from({ length: 24 }, (_, r) => {
                    const y = H * 0.08 + r * (H * 0.84 / 24);
                    const w = 20 + Math.round(W * 0.16 * Math.exp(-(((r - 12) / 4.5) ** 2))) + ((r * 13) % 17);
                    return <rect key={`v${r}`} x={W - w} y={y} width={w} height={H * 0.84 / 24 - 3} fill="#38bdf8" opacity={r === 12 ? 0.4 : 0.12} />;
                })}
                <path d={area} fill="#38bdf8" opacity="0.06" />
                <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="2" />
                <line x1={lx} x2={lx} y1="0" y2={H} stroke="#e2e8f0" strokeDasharray="2 4" opacity="0.35" />
                <line x1="0" x2={W} y1={ly} y2={ly} stroke="#e2e8f0" strokeDasharray="2 4" opacity="0.35" />
                <circle cx={lx} cy={ly} r="10" fill="#38bdf8" opacity="0.2" />
                <circle cx={lx} cy={ly} r="4" fill="#38bdf8" />
                <rect x={W - 86} y={ly - 10} width="80" height="20" rx="4" fill="#38bdf8" />
                <text x={W - 80} y={ly + 4} fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill="#04060a">{fmt(price)}</text>
            </svg>
            <div className="absolute left-5 right-5 top-4 flex items-center justify-between">
                <span className="font-['Space_Grotesk',sans-serif] text-xl font-bold">funnel<span className="text-[#38bdf8]">/op</span></span>
                <span className={`${mono} inline-flex items-center gap-1.5 rounded-full bg-[#38bdf8]/10 px-2.5 py-1 text-[10px] font-semibold text-[#38bdf8]`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-[#38bdf8] ${live ? 'animate-pulse' : ''}`} />LIVE · NIFTY 24600 CE
                </span>
            </div>
            {!compact && (
                <div className="absolute bottom-5 left-5 flex gap-7">
                    <div><div className={`${mono} text-[10px] opacity-50`}>LTP</div><div data-testid="op-ltp" className={`${mono} text-2xl font-bold text-[#38bdf8]`}>{fmt(ltp)}</div></div>
                    <div><div className={`${mono} text-[10px] opacity-50`}>P&amp;L · 2 LOTS</div>
                        <div className={`${mono} text-2xl font-bold ${pnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{pnl >= 0 ? '+' : '-'}₹{Math.abs(pnl).toLocaleString('en-IN')}</div></div>
                    <div><div className={`${mono} text-[10px] opacity-50`}>OI CHG</div><div className={`${mono} text-2xl font-bold`}>+2.4L</div></div>
                </div>
            )}
            {compact && <span data-testid="op-ltp" className="sr-only">{fmt(ltp)}</span>}
        </div>
    );
}
