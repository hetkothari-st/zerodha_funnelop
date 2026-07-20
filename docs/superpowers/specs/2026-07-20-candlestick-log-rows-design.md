# Candlestick-style log rows for VerticalLayout

## Context

`VerticalLayout.jsx` shows one column per monitored strike, split into a Buy
side and a Sell side. Each side is a scrolling feed of `LogRow` entries
(`{price, observedQty, timestamp}`) captured by `MonitorDashboard.jsx` when a
depth-packet's bid/ask qty at some price level crosses the token's configured
quantity threshold. Today each row is plain text: a countdown timer, the
observed qty, and the price.

Goal: replace the plain-text qty+price with a small vertical candlestick icon
per row, so the feed reads as a live candle ladder instead of a number list,
while keeping every other mechanic (data fetch, thresholding, timers, sorting,
animation, retention) unchanged.

Out of scope: `OriginalLayout.jsx` (a different raw 5-level depth grid view),
the Net Qty Breakdown footer, data capture/threshold logic in
`MonitorDashboard.jsx`, column header/strike picker, resize/reorder/drag
logic.

## Data shape (unchanged)

Each log entry already has everything needed, no new fields required:

```
{ price, observedQty, side: 'buy'|'sell', timestamp, tokenId, id, ... }
```

There is no open/high/low/close — each row is a single point-in-time
price+qty observation, not a time-series bar. The candle is therefore a
stylized icon per row, not a real OHLC chart.

## Visual design

Per row, in place of the current qty/price text pair:

- **Wick**: fixed-length thin vertical line (decorative, marks it as a
  candle), centered above/below the body.
- **Body**: a colored rectangle. Height is derived from `observedQty` via the
  same tier thresholds already used for sound alerts in
  `MonitorDashboard.jsx` (`playAlertSound`: 20k / 50k / 100k / 200k):
  - `< 50,000`: short body, dim color (matches current non-`isHighQty`,
    non-recent styling)
  - `50,000 – 89,999`: medium body
  - `90,000 – 199,999`: tall body, amber override (matches current
    `isHighQty` amber treatment, ≥90000 threshold already in code)
  - `>= 200,000`: max height body, glow/pulse
- **Color**: buy rows are green-bodied, sell rows are red-bodied (side-based,
  not price-direction-based) — preserves the existing buy=green/sell=red
  convention. Amber overrides at the ≥90k tier same as today. Recent rows
  (`elapsed <= 60s`) keep the existing brighter/glow flash treatment; older
  rows fall back to the existing dimmer/opacity-70 treatment.
- **Price label**: rendered as text beside/under the candle icon (same
  numeric value as today, same violet color-tier logic already in
  `LogRow`).
- **Timer**: unchanged — stays at the outer edge (left for buy rows, right
  for sell rows), same `(m:ss)` format.
- **Row height**: grows from the current single text line (~20px) to
  roughly 36–44px to fit wick+body+label. List remains independently
  scrollable per side; the 250-row render slice and virtualization behavior
  are unchanged.

## Component structure

- New small presentational sub-component, e.g. `CandleIcon({ qty, side,
  isRecent })`, rendered via SVG or absolutely-positioned divs (wick line +
  body rect). Pure function of qty/side/recency — no new state, no new
  props threaded from parent beyond what `LogRow` already receives.
- `LogRow` (in `VerticalLayout.jsx`) swaps its qty/price `<span>` pair for
  `<CandleIcon .../>` + a price label span, keeping the existing
  `motion.div` wrapper, `initial/animate/exit` transitions, and the
  `React.memo` comparator (`prev.log.id === next.log.id && prev.timeTick ===
  next.timeTick`) as-is.
- No new dependency required — implemented with plain CSS/SVG, consistent
  with the project's existing stack (no charting library currently
  installed).

## Data flow / non-goals

No changes to: WebSocket subscription, `depthEvents` handling, log
capture/threshold logic, log retention/cleanup, Net Qty Breakdown
calculation or footer rendering, column header, strike/expiry pickers,
column resize/reorder/drag, `OriginalLayout.jsx`, `MonitorDashboard.jsx`
(except none — it is untouched; only `VerticalLayout.jsx` changes).

## Testing

Manual verification via `run` skill / dev server:

- Load VerticalLayout with an active token, confirm buy/sell candle icons
  render with correct color per side.
- Confirm body height visibly changes across the qty tiers (mock/observe
  low vs high qty prints).
- Confirm ≥90k amber override and ≥200k max-height/glow still trigger.
- Confirm recent-row (≤60s) brighter treatment and post-60s dimming still
  work as today.
- Confirm row list still scrolls, animates in/out (framer-motion), and caps
  at 250 rows per side without layout jank from the taller rows.
- Confirm Net Qty Breakdown footer, OriginalLayout, and all other
  interactions (drag/resize/strike-edit) are unaffected.
