import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorical, isoDaysAgo } from "@/lib/api";
import { fmtPrice, fmtPct, fmtVolume } from "@/lib/format";
import { snapshot } from "@/lib/indicators";
import {
  sigADX, sigBollinger, sigCross, sigMA, sigMACD, sigOBV, sigRSI, sigVolatility,
  tally, type Signal,
} from "@/lib/signals";
import { KV, SignalGroup, SignalRow } from "@/components/Signals";
import { useWorkspace } from "@/store/workspaceStore";
import { useSim } from "@/store/simStore";
import { todayIso } from "@/lib/asOf";
import { cn } from "@/lib/cn";

/**
 * Two years of daily bars. The 200-day average and the 252-day Donchian channel
 * both need roughly a year of history *before* the first value appears, so a
 * 1-year window would leave the trend panel permanently blank.
 */
const LOOKBACK_DAYS = 730;

export function TECH({ symbol }: { symbol: string }) {
  const openTab = useWorkspace((s) => s.openTab);
  const asOf = useSim((s) => s.asOf) ?? todayIso();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tech-historical", symbol, LOOKBACK_DAYS, asOf],
    queryFn: () => fetchHistorical(symbol, { start_date: isoDaysAgo(LOOKBACK_DAYS), end_date: asOf }),
    staleTime: 60_000,
  });

  const candles = useMemo(() => data ?? [], [data]);
  const s = useMemo(() => snapshot(candles), [candles]);

  if (isLoading) {
    return <div className="p-6 text-term-muted uppercase text-[11px] tracking-widest">Loading technicals for {symbol}…</div>;
  }
  if (error) {
    return <div className="p-6 text-term-red text-[12px]">{(error as Error).message}</div>;
  }
  if (candles.length === 0) {
    return (
      <div className="p-6 text-[12px]">
        <div className="text-term-red text-[11px] uppercase tracking-[0.3em] font-bold">NO PRICE HISTORY</div>
        <div className="text-term-heading mt-2">
          <span className="num text-term-amber font-bold">{symbol}</span> returned no daily bars, so no indicator can be computed.
        </div>
      </div>
    );
  }

  const trend: Signal[] = [
    sigMA(s.price, s.sma20, "20d MA"),
    sigMA(s.price, s.sma50, "50d MA"),
    sigMA(s.price, s.sma200, "200d MA"),
    sigCross(s.sma50, s.sma200, s.prevSma50, s.prevSma200),
    sigADX(s.adx14, s.plusDI, s.minusDI),
  ];
  const momentum: Signal[] = [
    sigRSI(s.rsi14),
    sigMACD(s.macd, s.macdSignal, s.prevMacd, s.prevMacdSignal),
    sigStoch(s.stochK, s.stochD),
  ];
  const volatility: Signal[] = [
    sigBollinger(s.percentB, s.bbWidth),
    sigVolatility(s.atr14, s.price),
  ];
  const volume: Signal[] = [sigOBV(s.obv, s.prevObv)];

  const all = [...trend, ...momentum, ...volatility, ...volume];
  const t = tally(all);
  // A verdict is a judgement, not a price move, so it is carried by weight
  // rather than hue — brightest for bullish, dimmest for undecided.
  const verdictTone =
    t.verdict === "Bullish" ? "text-term-heading"
    : t.verdict === "Bearish" ? "text-term-text"
    : "text-term-muted";

  const rangePct =
    s.donchianUpper != null && s.donchianLower != null && s.price != null &&
    s.donchianUpper > s.donchianLower
      ? ((s.price - s.donchianLower) / (s.donchianUpper - s.donchianLower)) * 100
      : undefined;

  return (
    <div className="p-4 grid gap-4 text-[12px]"
      style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>

      <div className="col-span-3 flex items-start justify-between border-b border-term-border pb-3">
        <div>
          <div className="flex items-baseline gap-4">
            <div className="text-[26px] text-term-amber font-bold tracking-widest">{symbol}</div>
            <div className="sub-header">TECHNICAL STUDY · {candles.length} DAILY BARS</div>
          </div>
          <div className="text-3xl num font-bold mt-2 text-term-heading">{fmtPrice(s.price)}</div>
        </div>
        <div className="text-right flex flex-col items-end gap-1 min-w-[220px]">
          <div className="sub-header">TECHNICAL VERDICT</div>
          <div className={cn("text-2xl font-bold tracking-[0.2em]", verdictTone)}>
            {t.verdict.toUpperCase()}
          </div>
          {/* Same square-dot vocabulary as levelDot, so the legend matches the rows. */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-term-heading" /><span className="num text-term-heading">{t.bull}</span> bullish</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-term-muted" /><span className="num text-term-muted">{t.neutral}</span> neutral</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 border border-term-heading" /><span className="num text-term-text">{t.bear}</span> bearish</span>
          </div>
          <div className="sub-header">RULE-BASED · NOT INVESTMENT ADVICE</div>
        </div>
      </div>

      <SignalGroup title="TREND" signals={trend} />
      <SignalGroup title="MOMENTUM" signals={momentum} />
      <SignalGroup title="VOLATILITY" signals={volatility} />

      <div className="panel">
        <div className="panel-header"><span>MOVING AVERAGES</span></div>
        <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <KV k="LAST" v={fmtPrice(s.price)} />
          <KV k="SMA 20" v={fmtPrice(s.sma20)} />
          <KV k="SMA 50" v={fmtPrice(s.sma50)} />
          <KV k="SMA 200" v={fmtPrice(s.sma200)} />
          <KV k="EMA 21" v={fmtPrice(s.ema21)} />
          <KV k="ROC 20d" v={<span className={cn(s.roc20 != null && (s.roc20 >= 0 ? "up" : "down"))}>{fmtPct(s.roc20)}</span>} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>OSCILLATORS</span></div>
        <div className="p-3 flex flex-col gap-2">
          <Gauge label="RSI (14)" value={s.rsi14} low={30} high={70} />
          <Gauge label="STOCH %K" value={s.stochK} low={20} high={80} />
          <Gauge label="STOCH %D" value={s.stochD} low={20} high={80} />
          <div className="mt-1 pt-2 border-t border-term-borderSoft grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <KV k="MACD" v={fmtPrice(s.macd)} />
            <KV k="SIGNAL" v={fmtPrice(s.macdSignal)} />
            {/* An oscillator reading is not a price move, so it stays neutral. */}
            <KV k="HISTOGRAM" v={fmtPrice(s.macdHist)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>BANDS &amp; RANGE</span></div>
        <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <KV k="BB UPPER" v={fmtPrice(s.bbUpper)} />
          <KV k="BB MID" v={fmtPrice(s.bbMid)} />
          <KV k="BB LOWER" v={fmtPrice(s.bbLower)} />
          <KV k="BB WIDTH" v={s.bbWidth != null ? `${s.bbWidth.toFixed(1)}%` : "—"} />
          <KV k="ATR (14)" v={fmtPrice(s.atr14)} />
          <KV k="52W HIGH" v={fmtPrice(s.donchianUpper)} />
          <KV k="52W LOW" v={fmtPrice(s.donchianLower)} />
          <KV k="IN RANGE" v={rangePct != null ? `${rangePct.toFixed(0)}%` : "—"} />
        </div>
      </div>

      <div className="panel col-span-2">
        <div className="panel-header"><span>DIRECTIONAL MOVEMENT</span></div>
        <div className="p-3 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
          <KV k="ADX (14)" v={s.adx14 != null ? s.adx14.toFixed(1) : "—"} />
          <KV k="+DI" v={<span className="text-term-heading">{s.plusDI != null ? s.plusDI.toFixed(1) : "—"}</span>} />
          <KV k="-DI" v={<span className="text-term-muted">{s.minusDI != null ? s.minusDI.toFixed(1) : "—"}</span>} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>VOLUME</span></div>
        <div className="p-3 flex flex-col gap-2">
          {volume.map((sig, i) => <SignalRow key={i} s={sig} />)}
          <div className="mt-1 pt-2 border-t border-term-borderSoft grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <KV k="OBV" v={fmtVolume(s.obv)} />
          </div>
        </div>
      </div>

      <div className="col-span-3 flex flex-wrap items-center gap-2 border-t border-term-border pt-2 text-[11px]">
        <span className="sub-header">DRILL DOWN:</span>
        {[
          { c: "GP", label: "Chart + Overlays" }, { c: "INTEL", label: "Full Scorecard" },
          { c: "HP", label: "Price History" }, { c: "KEY", label: "Ratios" },
        ].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never, symbol)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Stochastic reads like RSI: the extremes are the mean-reversion signal. */
function sigStoch(k?: number, d?: number): Signal {
  if (k == null) return { level: "na", label: "Stochastic n/a" };
  const detail = d == null ? `%K ${k.toFixed(0)}` : `%K ${k.toFixed(0)} · %D ${d.toFixed(0)}`;
  if (k < 20) return { level: "bull", label: "Oversold (Stoch)", detail };
  if (k > 80) return { level: "bear", label: "Overbought (Stoch)", detail };
  return { level: "neutral", label: "Stochastic mid", detail };
}

/** 0-100 oscillator drawn as a bar with its overbought/oversold thresholds marked. */
function Gauge({ label, value, low, high }: { label: string; value?: number; low: number; high: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  // Oversold and overbought are read off the marked thresholds, not off colour.
  const tone = value == null ? "bg-term-border" : "bg-term-heading";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="sub-header">{label}</span>
        <span className="num text-term-text">{value != null ? value.toFixed(1) : "—"}</span>
      </div>
      <div className="relative h-1.5 bg-term-bg2 border border-term-borderSoft mt-1">
        <div className={cn("absolute inset-y-0 left-0", tone)} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-term-border" style={{ left: `${low}%` }} />
        <div className="absolute inset-y-0 w-px bg-term-border" style={{ left: `${high}%` }} />
      </div>
    </div>
  );
}
