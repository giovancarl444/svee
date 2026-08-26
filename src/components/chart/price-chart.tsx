"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/hooks/use-token-market";

interface Props {
  candles: Candle[] | undefined;
  isLoading: boolean;
  error: string | null;
  symbol: string;
  /** shown when data is legitimately empty (e.g. chart warming up) */
  hint?: string;
}

const UP = "#00ff88";
const DOWN = "#ff3b3b";

/** Center chart zone — real OHLCV candles via lightweight-charts v5. */
export function PriceChart({ candles, isLoading, error, symbol, hint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Create the chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: "transparent" },
        textColor: "#5c5c66",
        fontSize: 11,
        fontFamily: "var(--font-jetbrains-mono), monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(139,92,246,0.4)", labelBackgroundColor: "#2a2a32" },
        horzLine: { color: "rgba(139,92,246,0.4)", labelBackgroundColor: "#2a2a32" },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: "rgba(139,92,246,0.35)",
      },
      1, // pane index — volume in its own strip below
    );
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeriesRef.current = volSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, []);

  // Push candle data in whenever it changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current || !candles) return;
    const rows = [...candles]
      .sort((a, b) => a.time - b.time)
      .map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    candleSeriesRef.current.setData(rows);
    volSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(0,255,136,0.3)" : "rgba(255,59,59,0.3)",
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      {/* timeframe bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="label-caps ml-1 mr-auto">{symbol} / USDC · LIVE</span>
        <span className="num pr-2 text-xs text-fg-muted">DEX feed</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-2/60">
            <span className="num text-xs text-fg-muted">loading candles…</span>
          </div>
        )}
        {!isLoading && (error || !candles || candles.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-2/60">
            <span className="num text-xs text-fg-muted">
              {error ?? hint ?? "no candle data for this pair"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
