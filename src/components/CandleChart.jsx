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
