import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, LineStyle,
  type IChartApi, type ISeriesApi, type LogicalRange, type UTCTimestamp,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorical, isoDaysAgo, type Candle } from "@/lib/api";
import { bollinger, closes, ema, macd, rsi, sma, type Series } from "@/lib/indicators";
import { fmtPrice, fmtVolume } from "@/lib/format";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";

const RANGES = [
  { label: "1M", days: 30, interval: "1d" },
  { label: "3M", days: 90, interval: "1d" },
  { label: "6M", days: 180, interval: "1d" },
  { label: "1Y", days: 365, interval: "1d" },
  { label: "3Y", days: 365 * 3, interval: "1W" },
  { label: "5Y", days: 365 * 5, interval: "1W" },
];

type OverlayKey = "sma20" | "sma50" | "sma200" | "ema21" | "bb";

/**
 * Studies are not price moves, so they carry no colour. They are told apart by
 * grey level and line style instead — which also survives being printed, or read
 * by someone who cannot separate red from green.
 */
const OVERLAYS: { key: OverlayKey; label: string; color: string; style: LineStyle }[] = [
  { key: "sma20", label: "SMA20", color: "#f5f5f5", style: LineStyle.Solid },
  { key: "sma50", label: "SMA50", color: "#b8b8b8", style: LineStyle.Solid },
  { key: "sma200", label: "SMA200", color: "#7a7a7a", style: LineStyle.Solid },
  { key: "ema21", label: "EMA21", color: "#f5f5f5", style: LineStyle.Dashed },
  { key: "bb", label: "BB(20,2)", color: "#5f5f5f", style: LineStyle.Dotted },
];

type SubPane = "NONE" | "RSI" | "MACD";
const SUB_PANES: SubPane[] = ["NONE", "RSI", "MACD"];

const toTime = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

/** Drop the warm-up gaps: lightweight-charts wants only the points that exist. */
function toLineData(candles: Candle[], series: Series) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = series[i];
    if (v == null) continue;
    out.push({ time: toTime(candles[i].date), value: v });
  }
  return out;
}

const CHART_BASE = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "#8a8a8a",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
  },
  rightPriceScale: { borderColor: "#2a2a2a" },
  timeScale: { borderColor: "#2a2a2a", timeVisible: false },
  grid: {
    vertLines: { color: "rgba(42,42,42,0.5)" },
    horzLines: { color: "rgba(42,42,42,0.5)" },
  },
  crosshair: {
    vertLine: { color: "#f5f5f5", width: 1 as const, style: 3, labelBackgroundColor: "#2a2a2a" },
    horzLine: { color: "#f5f5f5", width: 1 as const, style: 3, labelBackgroundColor: "#2a2a2a" },
  },
  autoSize: true,
};

interface Readout { bar: Candle; index: number; }

export function GP({ symbol }: { symbol: string }) {
  const asOf = useSim((s) => s.asOf) ?? todayIso();
  const [range, setRange] = useState(RANGES[3]);
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({
    sma20: false, sma50: true, sma200: true, ema21: false, bb: false,
  });
  const [subPane, setSubPane] = useState<SubPane>("NONE");
  const [readout, setReadout] = useState<Readout | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["historical", symbol, range.label, asOf],
    // Resolved when the query runs, not on every render: the start date is not
    // part of the key, so recomputing it mid-render silently drifts the window.
    queryFn: () =>
      fetchHistorical(symbol, {
        interval: range.interval,
        start_date: isoDaysAgo(range.days),
        end_date: asOf,
      }),
    staleTime: 60_000,
  });

  const candles = useMemo(() => data ?? [], [data]);

  const studies = useMemo(() => {
    const c = closes(candles);
    return {
      sma20: sma(c, 20), sma50: sma(c, 50), sma200: sma(c, 200),
      ema21: ema(c, 21), bb: bollinger(c, 20, 2),
      rsi: rsi(c, 14), macd: macd(c),
    };
  }, [candles]);

  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  // Both charts push their range to the other, so without this the first sync
  // bounces back and forth forever.
  const syncing = useRef(false);

  // Index bars by chart time so the crosshair can find the hovered bar.
  const indexByTime = useMemo(() => {
    const m = new Map<number, number>();
    candles.forEach((c, i) => m.set(toTime(c.date), i));
    return m;
  }, [candles]);

  // ── Main chart: created once ──
  useEffect(() => {
    if (!mainRef.current) return;
    const chart = createChart(mainRef.current, CHART_BASE);
    // Candles keep red and green: an up or down bar is a signed price move,
    // which is the one thing this palette still colours.
    const candle = chart.addCandlestickSeries({
      upColor: "#22ee22", downColor: "#ff3b3b",
      wickUpColor: "#22ee22", wickDownColor: "#ff3b3b",
      borderVisible: false,
    });
    // Volume has no sign, so it stays neutral.
    const vol = chart.addHistogramSeries({
      color: "rgba(255,255,255,0.2)", priceFormat: { type: "volume" }, priceScaleId: "",
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 } });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      overlayRefs.current = [];
    };
  }, []);

  // ── Price + volume data ──
  useEffect(() => {
    if (!candleRef.current || !volRef.current) return;
    candleRef.current.setData(candles.map((c) => ({
      time: toTime(c.date), open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    volRef.current.setData(candles.map((c) => ({
      time: toTime(c.date), value: c.volume,
    })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // ── Overlays: torn down and rebuilt as a set, which is cheap at this count
  // and avoids tracking which individual series is currently attached. ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of overlayRefs.current) chart.removeSeries(s);
    overlayRefs.current = [];
    if (candles.length === 0) return;

    const add = (points: ReturnType<typeof toLineData>, color: string, style: LineStyle) => {
      const s = chart.addLineSeries({
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: style,
      });
      s.setData(points);
      overlayRefs.current.push(s);
    };

    for (const o of OVERLAYS) {
      if (!overlays[o.key]) continue;
      if (o.key === "bb") {
        add(toLineData(candles, studies.bb.upper), o.color, LineStyle.Dotted);
        add(toLineData(candles, studies.bb.mid), o.color, LineStyle.Dashed);
        add(toLineData(candles, studies.bb.lower), o.color, LineStyle.Dotted);
      } else {
        add(toLineData(candles, studies[o.key]), o.color, o.style);
      }
    }
  }, [candles, overlays, studies]);

  // ── Crosshair readout ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // The crosshair fires per pixel: without this guard every mousemove builds
    // a fresh readout object and re-renders the whole panel, even on one bar.
    let lastIdx: number | null | undefined = undefined;
    const handler = (param: { time?: unknown }) => {
      const t = typeof param.time === "number" ? param.time : undefined;
      const idx = t == null ? null : (indexByTime.get(t) ?? null);
      if (idx === lastIdx) return;
      lastIdx = idx;
      setReadout(idx == null ? null : { bar: candles[idx], index: idx });
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [candles, indexByTime]);

  // ── Sub-pane: a second chart instance, because lightweight-charts v4 has no
  // multi-pane API. Recreated whenever the selected study changes. ──
  useEffect(() => {
    if (subPane === "NONE" || !subRef.current) return;
    const chart = createChart(subRef.current, CHART_BASE);
    subChartRef.current = chart;

    if (subPane === "RSI") {
      const s = chart.addLineSeries({ color: "#f5f5f5", lineWidth: 1, priceLineVisible: false });
      s.setData(toLineData(candles, studies.rsi));
      for (const level of [30, 70]) {
        s.createPriceLine({
          price: level, color: "#3a3a3a", lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "",
        });
      }
    } else {
      // MACD is an oscillator, not a price move, so the histogram is neutral.
      const hist = chart.addHistogramSeries({
        color: "rgba(255,255,255,0.25)", priceLineVisible: false,
      });
      hist.setData(toLineData(candles, studies.macd.histogram));
      const line = chart.addLineSeries({ color: "#f5f5f5", lineWidth: 1, priceLineVisible: false });
      line.setData(toLineData(candles, studies.macd.macd));
      const sig = chart.addLineSeries({
        color: "#8a8a8a", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false,
      });
      sig.setData(toLineData(candles, studies.macd.signal));
    }

    const main = chartRef.current;
    const relay = (to: IChartApi) => (r: LogicalRange | null) => {
      if (!r || syncing.current) return;
      syncing.current = true;
      to.timeScale().setVisibleLogicalRange(r);
      syncing.current = false;
    };
    const fromMain = relay(chart);
    const fromSub = main ? relay(main) : null;
    if (main) {
      main.timeScale().subscribeVisibleLogicalRangeChange(fromMain);
      if (fromSub) chart.timeScale().subscribeVisibleLogicalRangeChange(fromSub);
      const initial = main.timeScale().getVisibleLogicalRange();
      if (initial) chart.timeScale().setVisibleLogicalRange(initial);
    }

    return () => {
      if (main) main.timeScale().unsubscribeVisibleLogicalRangeChange(fromMain);
      chart.remove();
      subChartRef.current = null;
    };
  }, [subPane, candles, studies]);

  const idx = readout?.index;
  const bar = readout?.bar;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-6 px-3 h-8 border-b border-term-border bg-term-panel2 overflow-x-auto scroll-thin">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider shrink-0">
          <span className="text-term-heading">RANGE</span>
          {RANGES.map((r) => (
            <button key={r.label} onClick={() => setRange(r)}
              className={cn("px-1 py-0.5 border",
                r.label === range.label
                  ? "border-term-accent bg-term-accent text-term-bg"
                  : "border-transparent text-term-muted hover:text-term-text")}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider shrink-0">
          <span className="text-term-heading">OVERLAY</span>
          {OVERLAYS.map((o) => (
            <button key={o.key}
              onClick={() => setOverlays((prev) => ({ ...prev, [o.key]: !prev[o.key] }))}
              className={cn("px-1 py-0.5 border flex items-center gap-1",
                overlays[o.key]
                  ? "border-term-accent text-term-accent"
                  : "border-transparent text-term-muted hover:text-term-text")}>
              <span className="w-2 h-px" style={{ backgroundColor: o.color }} />
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider shrink-0">
          <span className="text-term-heading">STUDY</span>
          {SUB_PANES.map((p) => (
            <button key={p} onClick={() => setSubPane(p)}
              className={cn("px-1 py-0.5 border",
                p === subPane
                  ? "border-term-accent bg-term-accent text-term-bg"
                  : "border-transparent text-term-muted hover:text-term-text")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 h-6 border-b border-term-borderSoft text-[10px] num text-term-muted overflow-x-auto scroll-thin">
        {bar && idx != null ? (
          <>
            <span className="text-term-heading uppercase tracking-[0.18em]">{bar.date}</span>
            <span>O <span className="text-term-text">{fmtPrice(bar.open)}</span></span>
            <span>H <span className="text-term-text">{fmtPrice(bar.high)}</span></span>
            <span>L <span className="text-term-text">{fmtPrice(bar.low)}</span></span>
            {/* Close is signed against the open, so it keeps its colour. */}
            <span>C <span className={bar.close >= bar.open ? "up" : "down"}>{fmtPrice(bar.close)}</span></span>
            <span>VOL <span className="text-term-text">{fmtVolume(bar.volume)}</span></span>
            {OVERLAYS.filter((o) => overlays[o.key] && o.key !== "bb").map((o) => (
              <span key={o.key} style={{ color: o.color }}>
                {o.label} {fmtPrice((studies[o.key] as Series)[idx])}
              </span>
            ))}
            {overlays.bb && (
              <span className="text-term-muted">
                BB {fmtPrice(studies.bb.lower[idx])} / {fmtPrice(studies.bb.upper[idx])}
              </span>
            )}
            {subPane === "RSI" && (
              <span className="text-term-heading">RSI {fmtPrice(studies.rsi[idx], 1)}</span>
            )}
            {subPane === "MACD" && (
              <span className="text-term-heading">
                MACD {fmtPrice(studies.macd.macd[idx])} / {fmtPrice(studies.macd.signal[idx])}
              </span>
            )}
          </>
        ) : (
          <span className="uppercase tracking-[0.18em]">Hover the chart for bar detail</span>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={mainRef} className="absolute inset-0" />
        {isLoading && <Centered>LOADING…</Centered>}
        {error && <Centered error>{(error as Error).message}</Centered>}
      </div>

      {subPane !== "NONE" && (
        <div className="h-[140px] border-t border-term-border shrink-0 relative">
          <div ref={subRef} className="absolute inset-0" />
          <div className="absolute top-1 left-2 text-[10px] uppercase tracking-[0.18em] text-term-heading pointer-events-none z-10">
            {subPane}
          </div>
        </div>
      )}
    </div>
  );
}

function Centered({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div className={cn("absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-widest", error ? "text-term-red" : "text-term-muted")}>{children}</div>;
}
