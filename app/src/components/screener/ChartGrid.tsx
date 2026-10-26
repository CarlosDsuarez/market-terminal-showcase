import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { fetchEquityHistoricalBatch, type Candle } from "@/lib/api";
import type { ScreenerRow } from "@/lib/screener/query";
import { fmtPrice } from "@/lib/format";

interface Props {
  rows: ScreenerRow[];
  onOpen: (symbol: string) => void;
}

export function ChartGrid({ rows, onOpen }: Props) {
  const symbols = useMemo(
    () => rows.map((r) => String(r.symbol ?? "")).filter(Boolean),
    [rows],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["screener-charts", symbols.join(",")],
    queryFn: () => fetchEquityHistoricalBatch(symbols, { days: 90 }),
    enabled: symbols.length > 0,
    staleTime: 120_000,
  });

  if (isLoading) {
    return <div className="p-4 text-term-muted uppercase text-[11px] tracking-widest">Loading charts…</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 p-2 overflow-auto scroll-thin">
      {rows.map((row) => {
        const sym = String(row.symbol ?? "");
        const candles = seriesFor(data, sym);
        return (
          <button
            key={sym}
            type="button"
            onClick={() => onOpen(sym)}
            className="border border-term-border bg-term-panel2 p-2 text-left hover:border-term-accent"
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-term-amber font-semibold num">{sym}</span>
              <span className="num text-[11px] text-term-heading">{fmtPrice(Number(row.price))}</span>
            </div>
            <MiniChart candles={candles} />
            <div className="text-[10px] text-term-muted truncate mt-1">{String(row.name ?? "")}</div>
          </button>
        );
      })}
    </div>
  );
}

function seriesFor(data: Record<string, Candle[]> | undefined, sym: string): Candle[] {
  if (!data) return [];
  if (data[sym]?.length) return data[sym];
  const upper = sym.toUpperCase();
  for (const [k, v] of Object.entries(data)) {
    if (k.toUpperCase() === upper && v.length) return v;
  }
  return data[sym] ?? [];
}

function MiniChart({ candles }: { candles: Candle[] }) {
  const host = useRef<HTMLDivElement>(null);
  const first = candles[0]?.date;
  const last = candles[candles.length - 1]?.date;
  const lastClose = candles[candles.length - 1]?.close;

  useEffect(() => {
    const el = host.current;
    if (!el || candles.length < 2) return;
    const up = candles[candles.length - 1].close >= candles[0].close;
    const c = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a8a8a",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 9,
      },
      rightPriceScale: { visible: false, borderVisible: false },
      timeScale: { visible: false, borderVisible: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
      height: 48,
    });
    const series = c.addLineSeries({
      color: up ? "#3ddc84" : "#ff5c5c",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    series.setData(
      candles.map((bar) => ({
        time: Math.floor(new Date(bar.date).getTime() / 1000) as UTCTimestamp,
        value: bar.close,
      })),
    );
    c.timeScale().fitContent();
    return () => { c.remove(); };
    // Recreate only when the series identity changes, not on every parent render.
  }, [candles, first, last, lastClose]);

  if (candles.length < 2) {
    return <div className="h-12 text-term-muted text-[10px]">No history</div>;
  }
  return <div ref={host} className="h-12 w-full pointer-events-none" />;
}
