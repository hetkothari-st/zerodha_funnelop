# Candlestick charts per strike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Supersedes `docs/superpowers/plans/2026-07-20-candlestick-log-rows.md`
> (implemented the wrong shape — a candle icon per log row — on an
> abandoned, deleted branch/worktree, never merged). This plan implements
> `docs/superpowers/specs/2026-07-20-candlestick-charts-per-strike-design.md`.

**Goal:** Replace each strike column's Buy/Sell log-list-plus-footer in
`VerticalLayout.jsx` with two real OHLC candlestick charts (Buy left, Sell
right), built from a continuous top-of-book price sample (not the sparse
qty-threshold log capture), using TradingView's `lightweight-charts`.

**Architecture:** A pure, framework-free candle-bucketing module
(`candleAggregator.js`) turns a stream of `{price, qty, timestamp}` samples
into rolling 5-second OHLC+volume bars. A `CandleChart` component owns one
`lightweight-charts` instance per (token, side), subscribes directly to the
existing low-latency `depthEvents` EventTarget (bypassing React re-renders,
mirroring `OriginalLayout.jsx`'s existing `DepthCard` isolation pattern),
feeds sampled top-of-book prices through the aggregator, and pushes bars
into the chart via `series.update()`. `VerticalLayout.jsx` renders two
`CandleChart`s per column instead of the old log list + Net Qty footer.

**Tech Stack:** React 18, new dependency `lightweight-charts` (v5 API:
`createChart`, `chart.addSeries(CandlestickSeries, …)`,
`chart.addSeries(HistogramSeries, …)`). No test runner installed — pure
logic is verified with plain `node` + `assert`; React/library integration
is verified with `npm run build` plus manual browser verification.

## Global Constraints

- Buy-side price = best bid = `depth.depths[0].BP` (qty `depths[0].BQ`).
  Sell-side price = best ask = `depth.depths[0].SP` (qty `depths[0].SQ`).
  `depths[0]` is the top-of-book level (confirmed in
  `src/hooks/useMarketData.js`'s binary parser: index 0 is the first/best
  bid and ask entry).
- Candle bucket size: 5 seconds. Bucket key in epoch **seconds** =
  `Math.floor(timestampMs / 5000) * 5`.
- Volume per bucket = the qty of the sample that set the bucket's current
  `close` (last-observed, not summed).
- A candle is flagged "big order" (amber border/wick overlay, body keeps
  normal up/down color) if any sample in its bucket had
  `qty >= token.quantity`. Once flagged within a bucket, stays flagged for
  that bucket even if a later sample in the same bucket has smaller qty.
- Candle body color is standard chart convention: green
  (`close >= open`) / red (`close < open`) — not side-based. Buy vs sell is
  conveyed by chart position (left/right) and the existing "BUY"/"SELL"
  header labels, unchanged.
- No cap on retained candle history (full session, per (token, side)).
- Existing alert-sound/threshold logic, log capture for
  `addGlobalNotification`, `OriginalLayout.jsx`, column
  header/strike/expiry picker, resize/reorder/drag, ATM highlighting,
  quick-strikes are all unchanged.
- No dead code left behind: `handleClearLogs`/`onClearLogs` and
  `showNetQtyBreakdown`/`timeTick` become fully unused once the log
  list/footer are removed and must be deleted, not left as unused props.

---

### Task 1: Candle aggregator (pure logic)

**Files:**
- Create: `src/components/candleAggregator.js`
- Test: `scripts/test_candle_aggregator.mjs`

**Interfaces:**
- Produces: `bucketTimeSeconds(timestampMs: number): number`,
  `createCandleAggregator(): { ingest(sample): { candle, isNewBar } }`
  where `sample = { price: number, qty: number, timestamp: number,
  isBigOrder?: boolean }` and `candle = { time, open, high, low, close,
  volume, isBigOrder }`. Consumed by Task 3's `CandleChart`.

- [ ] **Step 1: Write the test script (fails — module doesn't exist yet)**

```js
// scripts/test_candle_aggregator.mjs
import assert from 'node:assert';
import { bucketTimeSeconds, createCandleAggregator } from '../src/components/candleAggregator.js';

// bucketTimeSeconds: floors epoch-ms into 5s epoch-second buckets
assert.strictEqual(bucketTimeSeconds(0), 0);
assert.strictEqual(bucketTimeSeconds(4999), 0);
assert.strictEqual(bucketTimeSeconds(5000), 5);
assert.strictEqual(bucketTimeSeconds(12345), 10);

// first sample opens a new bar
const agg = createCandleAggregator();
let result = agg.ingest({ price: 100, qty: 10, timestamp: 1000 });
assert.strictEqual(result.isNewBar, true);
assert.deepStrictEqual(result.candle, { time: 0, open: 100, high: 100, low: 100, close: 100, volume: 10, isBigOrder: false });

// second sample in the same 5s bucket updates high/low/close/volume, keeps open
result = agg.ingest({ price: 105, qty: 20, timestamp: 2000 });
assert.strictEqual(result.isNewBar, false);
assert.deepStrictEqual(result.candle, { time: 0, open: 100, high: 105, low: 100, close: 105, volume: 20, isBigOrder: false });

// a lower price in the same bucket updates the low, not the open
result = agg.ingest({ price: 95, qty: 5, timestamp: 3000 });
assert.strictEqual(result.isNewBar, false);
assert.deepStrictEqual(result.candle, { time: 0, open: 100, high: 105, low: 95, close: 95, volume: 5, isBigOrder: false });

// a sample in the next 5s bucket starts a new bar
result = agg.ingest({ price: 110, qty: 15, timestamp: 5000 });
assert.strictEqual(result.isNewBar, true);
assert.deepStrictEqual(result.candle, { time: 5, open: 110, high: 110, low: 110, close: 110, volume: 15, isBigOrder: false });

// isBigOrder is sticky within a bar: once true, stays true even if a later sample in the same bar isn't flagged
result = agg.ingest({ price: 111, qty: 90000, timestamp: 6000, isBigOrder: true });
assert.strictEqual(result.candle.isBigOrder, true);
result = agg.ingest({ price: 112, qty: 500, timestamp: 7000, isBigOrder: false });
assert.strictEqual(result.candle.isBigOrder, true, 'isBigOrder must stay true once set within the same bar');

console.log('candleAggregator: all assertions passed');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node scripts/test_candle_aggregator.mjs`
Expected: FAIL — `Cannot find module '.../src/components/candleAggregator.js'`

- [ ] **Step 3: Implement the module**

```js
// src/components/candleAggregator.js
export const CANDLE_BUCKET_SECONDS = 5;

export function bucketTimeSeconds(timestampMs) {
    return Math.floor(timestampMs / (CANDLE_BUCKET_SECONDS * 1000)) * CANDLE_BUCKET_SECONDS;
}

export function createCandleAggregator() {
    let current = null;

    function ingest({ price, qty, timestamp, isBigOrder }) {
        const time = bucketTimeSeconds(timestamp);
        const isNewBar = !current || current.time !== time;

        if (isNewBar) {
            current = {
                time,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: qty,
                isBigOrder: !!isBigOrder,
            };
        } else {
            current.high = Math.max(current.high, price);
            current.low = Math.min(current.low, price);
            current.close = price;
            current.volume = qty;
            if (isBigOrder) current.isBigOrder = true;
        }

        return { candle: { ...current }, isNewBar };
    }

    return { ingest };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node scripts/test_candle_aggregator.mjs`
Expected: PASS — prints `candleAggregator: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/candleAggregator.js scripts/test_candle_aggregator.mjs
git commit -m "feat: add pure candle-bucketing aggregator for chart data"
```

---

### Task 2: Install lightweight-charts and build CandleChart

**Files:**
- Modify: `package.json` (new dependency)
- Create: `src/components/CandleChart.jsx`

**Interfaces:**
- Consumes: `createCandleAggregator` from `src/components/candleAggregator.js` (Task 1).
- Produces: `CandleChart({ token, side, depthEvents, depthDataRef })` React
  component — `token` is a monitored-token object with at least `{ tkn,
  quantity }`, `side` is `'buy'|'sell'`, `depthEvents` is the app's
  `EventTarget` dispatching `'depth-packet'` CustomEvents whose `detail` is
  a depth packet `{ Tkn, depths: [{BP,BQ,SP,SQ,...}], _receivedAt }`,
  `depthDataRef` is a ref whose `.current` is a map of `tkn -> latest depth
  packet`. Consumed by Task 3's `VerticalLayout.jsx`.

- [ ] **Step 1: Install the dependency**

Run: `npm install lightweight-charts`
Expected: `package.json` gains a `lightweight-charts` entry under
`dependencies` (whatever version npm resolves — do not hand-edit the
version string).

- [ ] **Step 2: Write CandleChart.jsx**

```jsx
// src/components/CandleChart.jsx
import React, { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { createCandleAggregator } from './candleAggregator';

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';
const AMBER = '#fbbf24';

function extractSample(depthPacket, side) {
    const level = depthPacket?.depths?.[0];
    if (!level) return null;
    const price = side === 'buy' ? level.BP : level.SP;
    const qty = side === 'buy' ? level.BQ : level.SQ;
    if (!price) return null;
    return { price, qty, timestamp: depthPacket._receivedAt || Date.now() };
}

export default function CandleChart({ token, side, depthEvents, depthDataRef }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const aggregatorRef = useRef(null);
    if (!aggregatorRef.current) aggregatorRef.current = createCandleAggregator();

    useEffect(() => {
        const container = containerRef.current;

        const chart = createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: { background: { color: 'transparent' }, textColor: '#9ca3af' },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.05)' },
                horzLines: { color: 'rgba(255,255,255,0.05)' },
            },
            timeScale: { timeVisible: true, secondsVisible: true },
            rightPriceScale: { borderVisible: false },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: UP_COLOR,
            downColor: DOWN_COLOR,
            borderUpColor: UP_COLOR,
            borderDownColor: DOWN_COLOR,
            wickUpColor: UP_COLOR,
            wickDownColor: DOWN_COLOR,
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        chartRef.current = chart;
        seriesRef.current = series;
        volumeSeriesRef.current = volumeSeries;

        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        function applySample(sample) {
            if (!sample) return;
            const isBigOrder = sample.qty >= token.quantity;
            const { candle } = aggregatorRef.current.ingest({ ...sample, isBigOrder });

            const overrideColor = candle.isBigOrder ? AMBER : undefined;
            seriesRef.current?.update({
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                ...(overrideColor
                    ? { color: overrideColor, borderColor: overrideColor, wickColor: overrideColor }
                    : {}),
            });

            volumeSeriesRef.current?.update({
                time: candle.time,
                value: candle.volume,
                color: candle.isBigOrder ? AMBER : (candle.close >= candle.open ? UP_COLOR : DOWN_COLOR),
            });
        }

        const seeded = depthDataRef?.current?.[token.tkn] ?? depthDataRef?.current?.[String(token.tkn)];
        if (seeded) applySample(extractSample(seeded, side));

        if (!depthEvents) return;

        const tknStr = String(token.tkn);
        const handler = (e) => {
            const pkt = e.detail;
            if (String(pkt.Tkn || pkt.Token) !== tknStr) return;
            applySample(extractSample(pkt, side));
        };

        depthEvents.addEventListener('depth-packet', handler);
        return () => depthEvents.removeEventListener('depth-packet', handler);
    }, [depthEvents, depthDataRef, token.tkn, token.quantity, side]);

    return <div ref={containerRef} className="w-full h-full" />;
}
```

- [ ] **Step 3: Confirm the project builds**

Run: `npm run build`
Expected: PASS — no errors (component isn't wired into any page yet, but
must compile and its imports must resolve)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/CandleChart.jsx
git commit -m "feat: add CandleChart component using lightweight-charts"
```

---

### Task 3: Wire CandleChart into VerticalLayout, remove log list/footer

**Files:**
- Modify: `src/components/VerticalLayout.jsx`

**Interfaces:**
- Consumes: `CandleChart` from `src/components/CandleChart.jsx` (Task 2).
- Produces: `VerticalLayout` now accepts a `depthEvents` prop (in addition
  to its existing props) and no longer accepts/uses `onClearLogs` — read by
  Task 4's `MonitorDashboard.jsx` change.

This task makes several edits to the same file. Apply them in order.

- [ ] **Step 1: Update imports (replace current lines 1-6)**

Current:
```jsx
import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { Plus, Trash2, X, ChevronDown, Check, GripVertical, Eraser, Zap, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import contractsData from '../contracts_nsefo.json';
```

Replace with:
```jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, X, ChevronDown, Check, GripVertical, Zap, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Reorder, useDragControls } from 'framer-motion';
import contractsData from '../contracts_nsefo.json';
import CandleChart from './CandleChart';
```

(`memo`, `Eraser`, `motion`, `AnimatePresence` are dropped here because the
only code using them — `LogRow` and its Eraser "clear logs" buttons — is
deleted in Step 2 and Step 4 below. Verify this is true by searching the
rest of the file for `memo(`, `<Eraser`, and `motion.` before removing —
there should be none left outside what this task deletes.)

- [ ] **Step 2: Delete the `LogRow` component entirely**

Delete the whole block from `const LogRow = memo(React.forwardRef(...` down
through its closing `});` (immediately before `const DraggableColumn = ({`).
This is the entire component — timer, qty, price rendering — no part of it
is reused.

- [ ] **Step 3: Replace `DraggableColumn`'s signature and delete the Net Qty useMemo**

Current (`DraggableColumn`'s opening plus the whole net-qty calculation
block that immediately follows it):
```jsx
const DraggableColumn = ({ token, isAtm, onDragStateChange, logs, onRemove, onUpdateQty, onUpdateStrike, onUpdateType, onUpdateWidth, onClearLogs, timeTick, showNetQtyBreakdown }) => {
    const controls = useDragControls();
    const columnWidth = token.width || 300;

    // Net Quantity Calculation Logic
    // Net Quantity Calculation Logic
    const { netBuyData, netSellData } = useMemo(() => {
        // --- 1. Buy Side Logic ---
        const maxBuyQtyPerPrice = {};
        logs.forEach(log => {
            if (log.side !== 'buy' || log.observedQty < 25000) return;
            const price = Number(log.price).toFixed(2);
            if (!maxBuyQtyPerPrice[price] || log.observedQty > maxBuyQtyPerPrice[price]) {
                maxBuyQtyPerPrice[price] = log.observedQty;
            }
        });

        const buyBreakdown = Object.entries(maxBuyQtyPerPrice)
            .map(([price, qty]) => ({ price, qty }))
            .sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

        const buyTotal = buyBreakdown.reduce((sum, item) => sum + item.qty, 0);

        // Find the minimum buy price among the recorded buy levels
        const buyPriceValues = Object.keys(maxBuyQtyPerPrice).map(Number);
        const minBuyPrice = buyPriceValues.length > 0 ? Math.min(...buyPriceValues) : Infinity;

        // --- 2. Sell Side Logic (Profitable Trades Only) ---
        const maxSellQtyPerPrice = {};
        logs.forEach(log => {
            if (log.side !== 'sell' || log.observedQty < 25000) return;
            const price = Number(log.price).toFixed(2);

            // Sell side is only included if price > minBuyPrice (profitable)
            if (parseFloat(price) > minBuyPrice) {
                if (!maxSellQtyPerPrice[price] || log.observedQty > maxSellQtyPerPrice[price]) {
                    maxSellQtyPerPrice[price] = log.observedQty;
                }
            }
        });

        const sellBreakdown = Object.entries(maxSellQtyPerPrice)
            .map(([price, qty]) => ({ price, qty }))
            .sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

        const sellTotal = sellBreakdown.reduce((sum, item) => sum + item.qty, 0);

        return {
            netBuyData: { total: buyTotal, breakdown: buyBreakdown },
            netSellData: { total: sellTotal, breakdown: sellBreakdown }
        };
    }, [logs]);
```

Replace with:
```jsx
const DraggableColumn = ({ token, isAtm, onDragStateChange, onRemove, onUpdateQty, onUpdateStrike, onUpdateType, onUpdateWidth, depthEvents, depthDataRef }) => {
    const controls = useDragControls();
    const columnWidth = token.width || 300;
```

Everything between this point and the `{/* Split Columns (Buy | Sell) */}`
comment (resizing logic, `allStrikes`, strike-editor state/effects, the
column header JSX) is unchanged — do not touch it.

- [ ] **Step 4: Replace the "Split Columns" JSX block**

Current (the entire Buy/Sell columns block, ending right before
`</Reorder.Item>`):
```jsx
            {/* Split Columns (Buy | Sell) */}
            <div className="flex-1 min-h-0 flex divide-x divide-white/10">
                {/* Buy Column */}
                <div className="flex-1 flex flex-col min-w-0 group/buy">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider opacity-80">Buy</span>
                        <button
                            onClick={() => onClearLogs(token.id, 'buy')}
                            className="opacity-30 hover:opacity-100 transition-opacity absolute right-1 p-0.5 hover:text-emerald-400 text-white/50"
                            title="Clear Buy Logs"
                        >
                            <Eraser size={10} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1 scrollbar-thin [&::-webkit-scrollbar]:w-1">
                        <AnimatePresence initial={false} mode='popLayout'>
                            {logs.filter(l => l.side === 'buy').slice(0, 250).map((log) => (
                                <LogRow key={log.id} log={log} token={token} side="buy" timeTick={timeTick} />
                            ))}
                        </AnimatePresence>
                    </div>
                    {/* Net Qty Footer */}
                    <div className={cn(
                        "p-1 px-2 border-t border-white/10 bg-white/[0.02] transition-all",
                        showNetQtyBreakdown ? "min-h-[60px] max-h-[120px] overflow-y-auto scrollbar-none" : "h-[28px]"
                    )}>
                        {!showNetQtyBreakdown ? (
                            <div className="flex items-center justify-between h-full">
                                <span className="text-[9px] font-bold text-white/30 uppercase">Net Qty</span>
                                <span className={cn(
                                    "font-mono text-[13px] font-black tracking-tight",
                                    netBuyData.total > 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]" : "text-white/20"
                                )}>
                                    {netBuyData.total.toLocaleString()}
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                <div className="flex items-center justify-between border-b border-white/5 pb-0.5 mb-1">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-tighter">Net Breakdown (Buy)</span>
                                    <span className="text-[10px] font-black text-emerald-400/80">{netBuyData.total.toLocaleString()}</span>
                                </div>
                                {netBuyData.breakdown.length === 0 ? (
                                    <div className="text-[10px] text-white/10 text-center py-2 italic font-medium">No 25k+ Qty</div>
                                ) : (
                                    netBuyData.breakdown.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-[11px] font-mono group/item">
                                            <span className="text-white/40 group-hover/item:text-white/60 transition-colors">{item.price}</span>
                                            <span className="text-emerald-400/90 font-bold">{item.qty.toLocaleString()}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sell Column */}
                <div className="flex-1 flex flex-col min-w-0 group/sell">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider opacity-80">Sell</span>
                        <button
                            onClick={() => onClearLogs(token.id, 'sell')}
                            className="opacity-30 hover:opacity-100 transition-opacity absolute right-1 p-0.5 hover:text-red-400 text-white/50"
                            title="Clear Sell Logs"
                        >
                            <Eraser size={10} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1 scrollbar-thin [&::-webkit-scrollbar]:w-1">
                        <AnimatePresence initial={false} mode='popLayout'>
                            {logs.filter(l => l.side === 'sell').slice(0, 250).map((log) => (
                                <LogRow key={log.id} log={log} token={token} side="sell" timeTick={timeTick} />
                            ))}
                        </AnimatePresence>
                    </div>
                    {/* Net Qty Footer */}
                    <div className={cn(
                        "p-1 px-2 border-t border-white/10 bg-white/[0.02] transition-all",
                        showNetQtyBreakdown ? "min-h-[60px] max-h-[120px] overflow-y-auto scrollbar-none" : "h-[28px]"
                    )}>
                        {!showNetQtyBreakdown ? (
                            <div className="flex items-center justify-between h-full">
                                <span className="text-[9px] font-bold text-white/30 uppercase">Net Qty</span>
                                <span className={cn(
                                    "font-mono text-[13px] font-black tracking-tight",
                                    netSellData.total > 0 ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]" : "text-white/20"
                                )}>
                                    {netSellData.total.toLocaleString()}
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                <div className="flex items-center justify-between border-b border-white/5 pb-0.5 mb-1">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-tighter">Net Breakdown (Sell)</span>
                                    <span className="text-[10px] font-black text-red-400/80">{netSellData.total.toLocaleString()}</span>
                                </div>
                                {netSellData.breakdown.length === 0 ? (
                                    <div className="text-[10px] text-white/10 text-center py-2 italic font-medium">No {token.quantity >= 100000 ? '1L+' : (token.quantity >= 1000 ? (token.quantity / 1000).toFixed(0) + 'k+' : token.quantity)} Qty</div>
                                ) : (
                                    netSellData.breakdown.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-[11px] font-mono group/item">
                                            <span className="text-white/40 group-hover/item:text-white/60 transition-colors">{item.price}</span>
                                            <span className="text-red-400/90 font-bold">{item.qty.toLocaleString()}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Reorder.Item>
```

Replace with:
```jsx
            {/* Split Charts (Buy | Sell) */}
            <div className="flex-1 min-h-0 flex divide-x divide-white/10">
                {/* Buy Chart */}
                <div className="flex-1 flex flex-col min-w-0 group/buy">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider opacity-80">Buy</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <CandleChart key={token.tkn} token={token} side="buy" depthEvents={depthEvents} depthDataRef={depthDataRef} />
                    </div>
                </div>

                {/* Sell Chart */}
                <div className="flex-1 flex flex-col min-w-0 group/sell">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider opacity-80">Sell</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <CandleChart key={token.tkn} token={token} side="sell" depthEvents={depthEvents} depthDataRef={depthDataRef} />
                    </div>
                </div>
            </div>
        </Reorder.Item>
```

(`key={token.tkn}` forces `CandleChart` to fully remount — fresh chart,
fresh aggregator, no stale candles — whenever the column's strike/type
changes, the same way changing strike already clears that token's old
`logs` elsewhere in the app.)

- [ ] **Step 5: Remove now-unused `VerticalLayout`-level state and props**

Current outer component signature (lines 456-472):
```jsx
const VerticalLayout = ({
    monitoredTokens,
    logs,
    onAddTokens,
    onRemoveToken,
    onUpdateTokenQty,
    onUpdateTokenStrike,
    onUpdateTokenType,
    onUpdateTokenWidth,
    onClearTokens,
    visibleElements,

    onReorderTokens,
    isSidebarVisible,
    depthDataRef,
    onClearLogs,
}) => {
    // --- Top Bar State (Unchanged) ---
    const [globalIndex, setGlobalIndex] = useState('NIFTY');
    const [globalExpiry, setGlobalExpiry] = useState('');
    const [atmStrikes, setAtmStrikes] = useState({});
    const [timeTick, setTimeTick] = useState(0);
    const [showNetQtyBreakdown, setShowNetQtyBreakdown] = useState(false);
    const isDraggingRef = useRef(false);

    // Throttle for activity sorting
    const lastActivitySortRef = useRef(0);

    // Live Timer Tick
    useEffect(() => {
        const interval = setInterval(() => setTimeTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);
```

Replace with:
```jsx
const VerticalLayout = ({
    monitoredTokens,
    logs,
    onAddTokens,
    onRemoveToken,
    onUpdateTokenQty,
    onUpdateTokenStrike,
    onUpdateTokenType,
    onUpdateTokenWidth,
    onClearTokens,
    visibleElements,

    onReorderTokens,
    isSidebarVisible,
    depthDataRef,
    depthEvents,
}) => {
    // --- Top Bar State (Unchanged) ---
    const [globalIndex, setGlobalIndex] = useState('NIFTY');
    const [globalExpiry, setGlobalExpiry] = useState('');
    const [atmStrikes, setAtmStrikes] = useState({});
    const isDraggingRef = useRef(false);

    // Throttle for activity sorting
    const lastActivitySortRef = useRef(0);
```

(`logs` is kept — it's still read by the activity-based auto-reorder effect
further down in this component, unrelated to rendering. Only the
Buy/Sell-list rendering path that consumed it is gone.)

- [ ] **Step 6: Remove the "Breakdown" toggle from the top bar**

Current (inside the top bar, between the "Add Column" button and the
"Clear" button):
```jsx
                    <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded border border-white/10 h-7">
                        <label className="text-[10px] text-white/40 uppercase font-black tracking-tight">Breakdown</label>
                        <button
                            onClick={() => setShowNetQtyBreakdown(!showNetQtyBreakdown)}
                            className={cn(
                                "w-7 h-4 rounded-full relative transition-colors duration-300",
                                showNetQtyBreakdown ? "bg-emerald-500/80" : "bg-white/10"
                            )}
                        >
                            <div className={cn(
                                "absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm",
                                showNetQtyBreakdown ? "translate-x-3" : "translate-x-0"
                            )} />
                        </button>
                    </div>

                    <button onClick={onClearTokens} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 font-bold py-1 px-3 rounded text-[10px] h-7 flex items-center gap-2">
```

Replace with:
```jsx
                    <button onClick={onClearTokens} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 font-bold py-1 px-3 rounded text-[10px] h-7 flex items-center gap-2">
```

- [ ] **Step 7: Update the `DraggableColumn` render call**

Current:
```jsx
                            <DraggableColumn
                                key={token.id}
                                token={token}
                                isAtm={isAtm}
                                timeTick={timeTick}
                                onDragStateChange={(val) => (isDraggingRef.current = val)}
                                logs={logs.filter(l => l.tokenId === token.id || l.tokenId === token.tkn)}
                                onRemove={() => onRemoveToken(token.id)}
```

Replace with:
```jsx
                            <DraggableColumn
                                key={token.id}
                                token={token}
                                isAtm={isAtm}
                                depthEvents={depthEvents}
                                depthDataRef={depthDataRef}
                                onDragStateChange={(val) => (isDraggingRef.current = val)}
                                onRemove={() => onRemoveToken(token.id)}
```

Current (further down, end of the same `<DraggableColumn>` call):
```jsx
                                onUpdateWidth={(w) => onUpdateTokenWidth(token.id, w)}
                                onClearLogs={onClearLogs}
                                showNetQtyBreakdown={showNetQtyBreakdown}
                            />
```

Replace with:
```jsx
                                onUpdateWidth={(w) => onUpdateTokenWidth(token.id, w)}
                            />
```

- [ ] **Step 8: Confirm the project builds**

Run: `npm run build`
Expected: PASS — no errors, no "unused variable"-type failures (Vite
doesn't fail the build on unused vars, but re-check by eye that
`netBuyData`/`netSellData`/`LogRow`/`Eraser`/`AnimatePresence`/`motion`/
`memo`/`timeTick`/`showNetQtyBreakdown`/`onClearLogs` have zero remaining
references in this file)

- [ ] **Step 9: Commit**

```bash
git add src/components/VerticalLayout.jsx
git commit -m "feat: replace log list/footer with buy/sell candlestick charts in VerticalLayout"
```

---

### Task 4: Thread depthEvents through MonitorDashboard, remove dead handleClearLogs

**Files:**
- Modify: `src/components/MonitorDashboard.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `VerticalLayout` (Task 3) now actually receives a live
  `depthEvents` prop from its parent.

- [ ] **Step 1: Remove the now-dead `handleClearLogs` handler**

Current (in `src/components/MonitorDashboard.jsx`):
```jsx
    const handleClearLogs = useCallback((tokenId, side) => {
        setLogs(prev => prev.filter(log => !(log.tokenId === tokenId && log.side === side)));
    }, []);

    const handleClearAllTokens = useCallback(() => {
```

Replace with:
```jsx
    const handleClearAllTokens = useCallback(() => {
```

(`handleClearLogs` was only ever passed to `VerticalLayout`'s
`onClearLogs`, which Task 3 removed. `OriginalLayout` never used it. It is
now unreachable and must be deleted, not left in place.)

- [ ] **Step 2: Update the `VerticalLayout` render call**

Current:
```jsx
                <VerticalLayout
                    visibleElements={visibleElements}
                    monitoredTokens={monitoredTokens}
                    logs={logs}
                    onAddTokens={handleAddTokens}
                    onRemoveToken={handleRemoveToken}
                    onClearTokens={handleClearAllTokens}
                    onUpdateTokenQty={handleUpdateTokenQty}
                    onUpdateTokenStrike={handleUpdateTokenStrike}
                    onUpdateTokenType={handleUpdateTokenType}
                    onUpdateTokenWidth={handleUpdateTokenWidth}
                    onClearLogs={handleClearLogs}
                    showAllPrices={showAllPrices}
                    setShowAllPrices={setShowAllPrices}
                    onReorderTokens={setMonitoredTokens}
                    isSidebarVisible={isSidebarVisible}
                    depthDataRef={latestDepthData}
                />
```

Replace with:
```jsx
                <VerticalLayout
                    visibleElements={visibleElements}
                    monitoredTokens={monitoredTokens}
                    logs={logs}
                    onAddTokens={handleAddTokens}
                    onRemoveToken={handleRemoveToken}
                    onClearTokens={handleClearAllTokens}
                    onUpdateTokenQty={handleUpdateTokenQty}
                    onUpdateTokenStrike={handleUpdateTokenStrike}
                    onUpdateTokenType={handleUpdateTokenType}
                    onUpdateTokenWidth={handleUpdateTokenWidth}
                    showAllPrices={showAllPrices}
                    setShowAllPrices={setShowAllPrices}
                    onReorderTokens={setMonitoredTokens}
                    isSidebarVisible={isSidebarVisible}
                    depthDataRef={latestDepthData}
                    depthEvents={depthEvents}
                />
```

(`depthEvents` is already a prop `MonitorDashboard` itself receives from
`App.jsx` — confirm this by checking `MonitorDashboard`'s own destructured
props list near the top of the file; it is used elsewhere in this same
file for the existing alert-sound listener, so it is already in scope
here.)

- [ ] **Step 3: Add a dev-only debug hook for manual verification**

In `src/App.jsx`, immediately after the line that creates the
`depthEvents` ref (`const depthEvents = React.useRef(new EventTarget());`),
add:

```jsx
    if (import.meta.env.DEV) {
        window.__debugDepthEvents = depthEvents.current;
    }
```

This exposes the live event bus as `window.__debugDepthEvents` only in
dev builds (`import.meta.env.DEV` is stripped to `false` and dead-code
eliminated in production builds by Vite), purely so Task 5's manual
verification can dispatch synthetic depth packets without a live broker
connection. It has no effect on production behavior.

- [ ] **Step 4: Confirm the project builds**

Run: `npm run build`
Expected: PASS — no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/MonitorDashboard.jsx src/App.jsx
git commit -m "feat: thread depthEvents to VerticalLayout, remove dead handleClearLogs, add dev debug hook"
```

---

### Task 5: Manual end-to-end visual verification

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:vite`
Expected: Vite prints a local URL (e.g. `http://localhost:5191`)

- [ ] **Step 2: Seed a monitored token and force vertical layout**

Using Playwright MCP (`browser_navigate` to the dev URL, then
`browser_evaluate`):

```js
() => {
    localStorage.setItem('mt_monitor_layouts', JSON.stringify({ 0: 'vertical' }));
    localStorage.setItem('mt_monitored_tokens_0', JSON.stringify([{
        id: 'test_token_1', tkn: '999999', symbol: 'NIFTY 24000 CE',
        strike: '24000', type: 'CE', side: 'both', quantity: 25000,
        expiry: '2026-07-31T00:00:00', index: 'NIFTY'
    }]));
}
```

Then `browser_navigate` to the same URL again (reload) so the app re-seeds
`monitoredTokens`/`layoutMode` from `localStorage`.

- [ ] **Step 3: Drive fake depth packets through the dev-only debug hook**

Run this in the browser console via `browser_evaluate`, once per line,
waiting ~1 second between calls so each lands in a different part of the
5-second bucket timeline (or run them all at once — the aggregator buckets
by the packet's own timestamp, not wall-clock delay between calls):

```js
() => {
    const now = Date.now();
    const pkt = (bp, sp, bq, sq, tOffsetMs) => ({
        Tkn: '999999', Token: '999999',
        depths: [{ BP: bp, BQ: bq, SP: sp, SQ: sq }],
        _receivedAt: now + tOffsetMs,
    });
    const bus = window.__debugDepthEvents;
    // Bucket A (0-5s): buy price ramps 184 -> 186, one big order (>=25000) on sell
    bus.dispatchEvent(new CustomEvent('depth-packet', { detail: pkt(184.0, 184.5, 500, 400, 0) }));
    bus.dispatchEvent(new CustomEvent('depth-packet', { detail: pkt(185.0, 184.75, 600, 30000, 2000) }));
    bus.dispatchEvent(new CustomEvent('depth-packet', { detail: pkt(186.0, 184.25, 700, 300, 4000) }));
    // Bucket B (5-10s): buy price drops 186 -> 183 (should render red/down)
    bus.dispatchEvent(new CustomEvent('depth-packet', { detail: pkt(186.0, 184.0, 800, 350, 5000) }));
    bus.dispatchEvent(new CustomEvent('depth-packet', { detail: pkt(183.0, 183.5, 900, 400, 8000) }));
}
```

- [ ] **Step 4: Screenshot and verify**

Use `browser_take_screenshot`. Confirm:
- The column shows two chart panes side by side under the "BUY"/"SELL"
  labels (no more scrolling text log, no more "Net Qty" footer).
- The Buy chart shows two candles: the first (bucket A) green/up (184 ->
  186), the second (bucket B) red/down (186 -> 183).
- The Sell chart shows candles reflecting the ask-price samples.
- The bucket-A candle (which had a 30,000 sell-side qty sample, over the
  25,000 threshold) has an amber border/wick, on whichever chart reflects
  the sell-side sample (Sell chart, since qty 30000 was passed as `sq`).
- A volume histogram bar appears under each candle.
- No console errors.

- [ ] **Step 5: Confirm no regressions in untouched areas**

Still in the browser: switch to `original` layout (top toggle) and confirm
`OriginalLayout` renders unchanged (raw depth grid). Switch back to
`vertical`.

- [ ] **Step 6: Clean up test data**

```js
() => {
    localStorage.removeItem('mt_monitored_tokens_0');
    delete window.__debugDepthEvents;
}
```

- [ ] **Step 7: Stop the dev server**

No commit for this task (verification only, and the dev-only debug hook
from Task 4 is not test-only scaffolding to remove — it stays in the
codebase, gated by `import.meta.env.DEV`).
