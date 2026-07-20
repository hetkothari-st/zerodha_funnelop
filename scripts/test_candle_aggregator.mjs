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
