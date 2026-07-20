# Candlestick charts per strike (Buy | Sell)

> Supersedes `2026-07-20-candlestick-log-rows-design.md` and its plan, which
> implemented the wrong shape (a candle *icon* per log row). That work sits
> on an abandoned branch/worktree (`candlestick-log-rows`), never merged to
> `main`. This spec replaces it.

## Context

`VerticalLayout.jsx` shows one column per monitored strike. Each column
splits into a Buy sub-panel and a Sell sub-panel. Today those sub-panels
show a scrolling text log of `{price, qty, timestamp}` events — captured
only when a depth-packet's bid/ask qty at some price level crosses the
token's configured quantity threshold — plus a "Net Qty Breakdown" footer
(price-sorted aggregate list).

Goal: replace both of those with a real trading-style candlestick chart per
side — Buy chart on the left, Sell chart on the right, per strike column —
so the column reads like an actual price chart instead of a number/log
list.

Out of scope (unchanged): `OriginalLayout.jsx`, `MonitorDashboard.jsx`'s
WebSocket subscription/alert-log-capture/sound-alert logic, column
header/strike/expiry picker, column resize/reorder/drag, ATM highlighting,
quick-strikes.

## Price series: what drives the candles

The existing log capture is sparse (only fires above a qty threshold) and
unsuitable as a continuous OHLC price feed. Candles are instead built from
a **continuous top-of-book sample**, independent of that threshold logic:

- **Buy-side price** = best bid price = `depth.depths[0].BP` (qty =
  `depth.depths[0].BQ`), sampled on every incoming depth packet for that
  token.
- **Sell-side price** = best ask price = `depth.depths[0].SP` (qty =
  `depth.depths[0].SQ`), sampled the same way.

`depths[0]` is already the top-of-book level in the existing 5-level depth
array (`OriginalLayout.jsx` renders `depth.depths[i]` for `i` 0-4 in that
order today).

The existing threshold-based alert log capture in `MonitorDashboard.jsx`
(sound alerts, `addGlobalNotification`) is **unchanged** and untouched by
this feature — it keeps running exactly as it does today, in parallel.

## Candle construction

- **Bucket size:** 5 seconds. Given `timestamp` as epoch milliseconds
  (`Date.now()`-style), the bucket key in milliseconds is
  `Math.floor(timestamp / 5000) * 5000`; the value passed to the charting
  library's `time` field is that same bucket key converted to epoch
  **seconds**: `Math.floor(timestamp / 5000) * 5`.
- For each `(token, side)` pair, maintain the in-progress bucket's
  open/high/low/close from every sampled price in that window: `open` = first
  sample's price in the bucket, `high`/`low` = running max/min, `close` =
  most recent sample's price.
- `volume` for that bucket = the qty (`BQ`/`SQ`) observed at the moment of
  the sample that set the current `close` (last-observed qty in the
  bucket, not summed — this is depth qty, not traded volume, so summing
  across samples would double count a resting order seen on multiple
  packets).
- When a new bucket key is reached, the previous bucket is final (no more
  updates to it) and the new bucket starts from that sample.
- **Retention:** no cap — full trading session held in memory per
  `(token, side)` (bounded naturally: a 6.5-hour session at 5s candles is
  ~4,680 candles/side, trivial for the charting library).

## Big-order highlight (ties into existing alert-qty logic)

Any candle whose bucket saw a sample with qty `>= token.quantity` (the
same threshold already used for sound alerts) gets its **border and wick**
recolored amber on that specific bar, while the body keeps its normal
up/down (green/red) color — an overlay, not a replacement of the
direction color. This visually ties the existing big-order alert concept
to the exact candle it fired on.

## Candle/volume coloring

Standard chart convention, not side-based: within each chart (buy or
sell), a candle is **green when close >= open** (up) and **red when close
< open** (down). The buy-vs-sell distinction is conveyed by position
(left/right) and the existing "BUY"/"SELL" sub-panel header labels, not by
forcing one fixed color per side. A volume histogram bar renders beneath
each candle, colored to match that candle (green/red), height
proportional to that bucket's qty; amber-highlighted (big-order) buckets
tint their volume bar amber too.

## Component structure

- **New file `src/components/CandleChart.jsx`**: one instance renders one
  side (buy or sell) of one column. Props: `token` (for `tkn`, `quantity`),
  `side` (`'buy'|'sell'`), `depthEvents` (the existing low-latency
  EventTarget bus), `depthDataRef` (existing buffered-latest-packet ref, for
  initial seed on mount).
  - Owns its own `lightweight-charts` chart instance
    (`createChart`/`chart.addSeries(CandlestickSeries, …)` +
    `chart.addSeries(HistogramSeries, …)` for volume, v5 API) and its own
    in-memory candle-aggregation state, entirely in refs.
  - Subscribes directly to `depthEvents` `'depth-packet'` events filtered
    to its own `token.tkn` (same isolation pattern `OriginalLayout.jsx`'s
    `DepthCard` already uses to avoid parent re-renders) and calls
    `series.update(...)` / `volumeSeries.update(...)` imperatively — no
    React state holds the OHLC data, so a new candle sample never triggers
    a `VerticalLayout` or `MonitorDashboard` re-render.
  - Seeds from `depthDataRef.current[token.tkn]` on mount if already
    buffered, so a freshly rendered/re-ordered column isn't blank until
    the next packet.
  - Uses a `ResizeObserver` on its own container div to call
    `chart.applyOptions({ width, height })` on resize — decouples chart
    sizing from the column-width-drag logic entirely (no coupling to
    `DraggableColumn`'s resize handler).
  - Disposes via `chart.remove()` on unmount (token removed, or component
    unmounted for any other reason).

- **Modify `src/components/VerticalLayout.jsx`**: inside `DraggableColumn`,
  the "Split Columns (Buy | Sell)" region currently rendering the scrolling
  `LogRow` list + Net Qty Breakdown footer per side is replaced by
  `<CandleChart token={token} side="buy" .../>` and `<CandleChart
  token={token} side="sell" .../>`, keeping the existing
  `divide-x divide-white/10` split and the "BUY"/"SELL" header labels. The
  per-side Eraser/"clear logs" buttons are removed (nothing left to clear
  in this view). The top-bar "Breakdown" toggle and its `showNetQtyBreakdown`
  state are removed (nothing left to toggle). `LogRow` and the `logs` prop
  threading into `DraggableColumn` for rendering purposes are removed;
  `MonitorDashboard`'s log capture itself is untouched (still needed for
  sound alerts), it simply stops being passed down for column rendering.

- **`package.json`**: add `lightweight-charts` (Apache-2.0, ~45kb gzip) as
  a new dependency.

## Non-goals / untouched

`OriginalLayout.jsx`, `MonitorDashboard.jsx`'s subscription/poll/alert-sound
logic, column header/strike/expiry picker, resize/reorder/drag, ATM
highlighting, quick-strikes, `contracts_nsefo.json` usage.

## Testing

No test framework exists in this repo (Vite + React, no Jest/Vitest
installed). Verification approach:

- Candle-aggregation bucketing logic (bucket-key computation, O/H/L/C/volume
  update rules) is pure and side-effect-free — write it as a small
  standalone module with plain `assert`-based test scripts runnable via
  `node`, independent of React/the charting library.
- `CandleChart.jsx` and the `VerticalLayout.jsx` integration are verified
  via `npm run build` (compiles cleanly) plus manual browser verification
  (seed fake `depth-packet` events or localStorage-backed buffered data,
  confirm both charts render, candles form/update over time, volume bars
  show, amber highlight appears on a qty-threshold-crossing sample, and
  resizing the column resizes both charts).
- Confirm `OriginalLayout.jsx`, sound alerts, and column
  header/resize/reorder/strike-picker are unaffected.
