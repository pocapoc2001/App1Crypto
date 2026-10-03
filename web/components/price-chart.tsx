"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useCandles } from "@/lib/api";
import { useEthPrice } from "@/lib/metadata";
import { cn } from "@/lib/utils";

const INTERVALS = [
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "1D", value: 86400 },
];

/** Market-cap candles (USD when the ETH price is known, otherwise ETH). */
export function PriceChart({ chainId, address }: { chainId: number; address: string }) {
  const [interval, setIntervalValue] = useState(60);
  const { data: candles } = useCandles(chainId, address, interval);
  const { data: ethUsd } = useEthPrice();
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fittedFor = useRef<string>("");

  useEffect(() => {
    if (!container.current) return;
    const dark = resolvedTheme !== "light";
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#9aa3b2" : "#4b5563",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)" },
        horzLines: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      localization: {
        priceFormatter: (p: number) =>
          Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(p),
      },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    fittedFor.current = "";
    return () => chart.remove();
  }, [resolvedTheme]);

  useEffect(() => {
    if (!candles || !candleRef.current || !volumeRef.current) return;
    const k = 1_000_000_000 * (ethUsd ?? 1); // price -> market cap
    candleRef.current.setData(
      candles.map((c) => ({
        time: Number(c.bucket) as UTCTimestamp,
        open: c.open * k,
        high: c.high * k,
        low: c.low * k,
        close: c.close * k,
      })),
    );
    volumeRef.current.setData(
      candles.map((c) => ({
        time: Number(c.bucket) as UTCTimestamp,
        value: c.volumeEth * (ethUsd ?? 1),
        color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      })),
    );
    const key = `${address}:${interval}:${resolvedTheme}`;
    if (fittedFor.current !== key && candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
      fittedFor.current = key;
    }
  }, [candles, ethUsd, address, interval, resolvedTheme]);

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-semibold">Market cap {ethUsd ? "(USD)" : "(ETH)"}</p>
        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => setIntervalValue(i.value)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                interval === i.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={container} className="h-[360px] w-full" />
    </div>
  );
}
