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
