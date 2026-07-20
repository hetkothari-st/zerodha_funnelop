# Candlestick-style log rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text qty/price pair in each `VerticalLayout.jsx` log row with a small vertical candlestick icon, so the buy/sell feed reads as a live candle ladder instead of a number list.

**Architecture:** A pure-logic module (`candleVisual.js`) maps `observedQty` to a tier and pixel height. A presentational SVG component (`CandleIcon.jsx`) consumes that plus `side`/`isRecent` to render a colored wick+body icon. `LogRow` inside `VerticalLayout.jsx` swaps its existing qty `<span>` for `<CandleIcon>`, leaving timer, price label, animation, and data flow untouched.

**Tech Stack:** React 18, no new dependency — plain SVG + Tailwind classes, consistent with existing stack (project has no test runner installed; verification uses plain `node` for pure logic and `npm run build` / manual browser check for components).

## Global Constraints

- Scope is `VerticalLayout.jsx` only — do not touch `OriginalLayout.jsx`, `MonitorDashboard.jsx`, Net Qty Breakdown footer, column header/strike picker, resize/reorder/drag logic.
- No new npm dependency.
- Qty tiers: `< 50,000` = low, `50,000–89,999` = medium, `90,000–199,999` = high (amber override, matches existing `isHighQty = observedQty >= 90000` constant already in code), `>= 200,000` = max (tallest, strongest glow).
- Body color: buy = green family, sell = red family (side-based, not price-direction), amber overrides both at high/max tier — same convention as current qty-text coloring.
- Timer position, price label logic/coloring, row ordering (newest on top), 250-row slice, `React.memo` comparator, and framer-motion enter/exit animation stay exactly as they are today.

---

### Task 1: Candle tier/height pure logic module

**Files:**
- Create: `src/components/candleVisual.js`
- Test: `scripts/test_candle_visual.mjs`

**Interfaces:**
- Produces: `getCandleTier(qty: number): 'low'|'medium'|'high'|'max'`, `getCandleBodyHeight(qty: number): number` (px) — consumed by Task 2's `CandleIcon`.

- [ ] **Step 1: Write the test script (fails — module doesn't exist yet)**

```js
// scripts/test_candle_visual.mjs
import assert from 'node:assert';
import { getCandleTier, getCandleBodyHeight } from '../src/components/candleVisual.js';

assert.strictEqual(getCandleTier(0), 'low');
assert.strictEqual(getCandleTier(49999), 'low');
assert.strictEqual(getCandleTier(50000), 'medium');
assert.strictEqual(getCandleTier(89999), 'medium');
assert.strictEqual(getCandleTier(90000), 'high');
assert.strictEqual(getCandleTier(199999), 'high');
assert.strictEqual(getCandleTier(200000), 'max');
assert.strictEqual(getCandleTier(500000), 'max');

assert.strictEqual(getCandleBodyHeight(0), 10);
assert.strictEqual(getCandleBodyHeight(50000), 18);
assert.strictEqual(getCandleBodyHeight(90000), 26);
assert.strictEqual(getCandleBodyHeight(200000), 34);

console.log('candleVisual: all assertions passed');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node scripts/test_candle_visual.mjs`
Expected: FAIL — `Cannot find module '.../src/components/candleVisual.js'`

- [ ] **Step 3: Implement the module**

```js
// src/components/candleVisual.js
export function getCandleTier(qty) {
    if (qty >= 200000) return 'max';
    if (qty >= 90000) return 'high';
    if (qty >= 50000) return 'medium';
    return 'low';
}

const TIER_HEIGHTS = { low: 10, medium: 18, high: 26, max: 34 };

export function getCandleBodyHeight(qty) {
    return TIER_HEIGHTS[getCandleTier(qty)];
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node scripts/test_candle_visual.mjs`
Expected: PASS — prints `candleVisual: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/candleVisual.js scripts/test_candle_visual.mjs
git commit -m "feat: add qty-to-candle-tier pure logic for log row candles"
```

---

### Task 2: CandleIcon component

**Files:**
- Create: `src/components/CandleIcon.jsx`

**Interfaces:**
- Consumes: `getCandleTier`, `getCandleBodyHeight` from `src/components/candleVisual.js` (Task 1).
- Produces: `CandleIcon({ qty: number, side: 'buy'|'sell', isRecent: boolean })` React component — consumed by Task 3's `LogRow`.

- [ ] **Step 1: Write the component**

```jsx
// src/components/CandleIcon.jsx
import React from 'react';
import { getCandleTier, getCandleBodyHeight } from './candleVisual';

const WICK_HALF = 6;
const BODY_WIDTH = 12;
const ICON_WIDTH = BODY_WIDTH + 4;

const SIDE_COLORS = {
    buy: { dim: '#059669', bright: '#34d399', glow: 'rgba(16,185,129,0.8)' },
    sell: { dim: '#dc2626', bright: '#f87171', glow: 'rgba(239,68,68,0.8)' },
};
const AMBER = '#fbbf24';

export default function CandleIcon({ qty, side, isRecent }) {
    const tier = getCandleTier(qty);
    const bodyHeight = getCandleBodyHeight(qty);
    const isAmber = tier === 'high' || tier === 'max';
    const totalHeight = bodyHeight + WICK_HALF * 2;
    const colors = SIDE_COLORS[side];

    const bodyColor = isAmber ? AMBER : (isRecent ? colors.bright : colors.dim);

    const glowFilter = tier === 'max'
        ? 'drop-shadow(0 0 8px rgba(251,191,36,0.9))'
        : isAmber
            ? 'drop-shadow(0 0 6px rgba(251,191,36,0.6))'
            : isRecent
                ? `drop-shadow(0 0 5px ${colors.glow})`
                : 'none';

    return (
        <svg
            width={ICON_WIDTH}
            height={totalHeight}
            style={{ filter: glowFilter, flexShrink: 0 }}
        >
            <line
                x1={ICON_WIDTH / 2} y1={0}
                x2={ICON_WIDTH / 2} y2={totalHeight}
                stroke={bodyColor}
                strokeWidth={1.5}
            />
            <rect
                x={2} y={WICK_HALF}
                width={BODY_WIDTH} height={bodyHeight}
                fill={bodyColor}
                rx={2}
            />
        </svg>
    );
}
```

- [ ] **Step 2: Confirm the project still builds with the new file**

Run: `npm run build`
Expected: PASS — build completes with no errors (new file is valid JSX/ESM; unused-until-Task-3 is fine, Vite doesn't fail on unimported files)

- [ ] **Step 3: Commit**

```bash
git add src/components/CandleIcon.jsx
git commit -m "feat: add CandleIcon component (wick+body SVG per qty/side/recency)"
```

---

### Task 3: Wire CandleIcon into LogRow

**Files:**
- Modify: `src/components/VerticalLayout.jsx:1-75` (imports + `LogRow`)

**Interfaces:**
- Consumes: `CandleIcon` from `src/components/CandleIcon.jsx` (Task 2).

- [ ] **Step 1: Add the import**

In `src/components/VerticalLayout.jsx`, change the top imports (currently lines 1-6):

```jsx
import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { Plus, Trash2, X, ChevronDown, Check, GripVertical, Eraser, Zap, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import contractsData from '../contracts_nsefo.json';
import CandleIcon from './CandleIcon';
```

- [ ] **Step 2: Replace the `LogRow` body**

Replace the existing `LogRow` definition (currently lines 12-75, from `const LogRow = memo(...` through the closing `});` before `const DraggableColumn`) with:

```jsx
const LogRow = memo(React.forwardRef(({ log, token, side, timeTick }, ref) => {
    const isBuy = side === 'buy';

    // Calculate relative timer
    const elapsed = log.timestamp ? Math.floor((Date.now() - log.timestamp) / 1000) : 0;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timerStr = `(${mins}:${secs.toString().padStart(2, '0')})`;

    const isHighQty = log.observedQty >= 90000;
    const isRecent = elapsed <= 60;

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, x: isBuy ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
                "flex items-center justify-between gap-1 text-[13px] leading-tight px-1 py-1 rounded transition-all border-b last:border-0 overflow-hidden",
                isRecent
                    ? (isBuy ? "bg-emerald-500/20 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.3)]" : "bg-red-500/20 border-red-500/35 shadow-[0_0_12px_rgba(239,68,68,0.3)]")
                    : "border-white/5 hover:bg-white/5 opacity-70"
            )}
        >
            {isBuy ? (
                <>
                    <span className={cn("text-[10px] font-bold font-mono whitespace-nowrap shrink-0", isRecent ? "text-blue-200" : "text-blue-500")}>{timerStr}</span>
                    <div className="flex-1 flex items-center justify-center">
                        <CandleIcon qty={log.observedQty} side="buy" isRecent={isRecent} />
                    </div>
                    <span className={cn(
                        "font-mono whitespace-nowrap shrink-0 text-right transition-all duration-300",
                        isHighQty
                            ? "text-violet-200 font-black text-[14.5px] drop-shadow-[0_0_12px_rgba(167,139,250,1)]"
                            : isRecent ? "text-violet-100 font-black text-[13.5px] drop-shadow-[0_0_5px_rgba(255,255,255,0.4)]" : "text-violet-400/80 font-bold text-[13px]"
                    )}>{Number(log.price).toFixed(2)}</span>
                </>
            ) : (
                <>
                    <span className={cn(
                        "font-mono whitespace-nowrap shrink-0 text-left transition-all duration-300",
                        isHighQty
                            ? "text-violet-200 font-black text-[14.5px] drop-shadow-[0_0_12px_rgba(167,139,250,1)]"
                            : isRecent ? "text-violet-100 font-black text-[13.5px] drop-shadow-[0_0_5px_rgba(255,255,255,0.4)]" : "text-violet-400/80 font-bold text-[13px]"
                    )}>{Number(log.price).toFixed(2)}</span>
                    <div className="flex-1 flex items-center justify-center">
                        <CandleIcon qty={log.observedQty} side="sell" isRecent={isRecent} />
                    </div>
                    <span className={cn("text-[10px] font-bold font-mono whitespace-nowrap shrink-0 text-right", isRecent ? "text-blue-200" : "text-blue-500")}>{timerStr}</span>
                </>
            )}
        </motion.div>
    );
}), (prev, next) => {
    // Re-render if log changes OR if the timer needs to update (every second)
    return prev.log.id === next.log.id && prev.timeTick === next.timeTick;
});
```

Note: only the middle qty `<span>` was replaced by a centered `<div><CandleIcon/></div>`; timer span, price span, wrapper `motion.div` props, and the memo comparator are byte-for-byte unchanged except `py-0.5` → `py-1` on the wrapper's className (extra vertical room for the taller icon).

- [ ] **Step 3: Confirm the project builds**

Run: `npm run build`
Expected: PASS — no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/VerticalLayout.jsx
git commit -m "feat: render candle icon in place of qty text in VerticalLayout log rows"
```

---

### Task 4: Manual end-to-end visual verification

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:vite`
Expected: Vite prints a local URL (e.g. `http://localhost:5191`)

- [ ] **Step 2: Seed fake tokens/logs and force vertical layout via browser localStorage, then reload**

Using the Playwright MCP tools (`browser_navigate` to the dev URL, then `browser_evaluate`), run in the page:

```js
() => {
    localStorage.setItem('mt_monitor_layouts', JSON.stringify({ 0: 'vertical' }));
    localStorage.setItem('mt_monitored_tokens_0', JSON.stringify([{
        id: 'test_token_1', tkn: '999999', symbol: 'NIFTY 24000 CE',
        strike: '24000', type: 'CE', side: 'both', quantity: 25000,
        expiry: '2026-07-31T00:00:00', index: 'NIFTY'
    }]));
    const now = Date.now();
    localStorage.setItem('mt_logs_0', JSON.stringify([
        { id: 'l1', tokenId: 'test_token_1', side: 'buy', price: 184.5, observedQty: 30000, timestamp: now - 5000 },
        { id: 'l2', tokenId: 'test_token_1', side: 'buy', price: 182.0, observedQty: 95000, timestamp: now - 20000 },
        { id: 'l3', tokenId: 'test_token_1', side: 'buy', price: 190.0, observedQty: 250000, timestamp: now - 40000 },
        { id: 'l4', tokenId: 'test_token_1', side: 'sell', price: 184.75, observedQty: 60000, timestamp: now - 3000 },
        { id: 'l5', tokenId: 'test_token_1', side: 'sell', price: 183.0, observedQty: 40000, timestamp: now - 90000 },
    ]));
}
```

Then `browser_navigate` to the same URL again (reload) so `MonitorDashboard` re-seeds its state from `localStorage`.

- [ ] **Step 3: Screenshot and visually confirm**

Use `browser_take_screenshot`. Confirm:
- Buy column (left sub-column): 3 candle icons, green/amber bodies, distinct heights — the 250,000-qty row tallest with the strongest glow, the 95,000-qty row amber, the 30,000-qty row short and dim/bright per its 5s recency.
- Sell column (right sub-column): 2 candle icons, red bodies (60,000-qty taller than 40,000-qty), price label left of candle, timer right of candle.
- Timer and price text are still present and correctly positioned per side.
- Row height increased slightly but list still scrolls without clipping.

- [ ] **Step 4: Confirm no regressions in untouched areas**

Still in the browser: switch to `original` layout (top toggle) and confirm `OriginalLayout` renders unchanged (raw depth grid, no candle icons expected there). Switch back to `vertical` and confirm Net Qty Breakdown footer toggle still shows plain numeric breakdown (unchanged).

- [ ] **Step 5: Clean up test data**

```js
() => {
    localStorage.removeItem('mt_monitored_tokens_0');
    localStorage.removeItem('mt_logs_0');
}
```

No commit for this task (verification only).
