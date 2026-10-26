import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart, ColorType, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { fetchHistorical } from "@/lib/api";
import { todayIso } from "@/lib/asOf";
import { fmtPctFromDecimal, fmtPrice } from "@/lib/format";
import { summarize, type PerfSummary } from "@/lib/perf";
import { buildEquityCurve } from "@/lib/portfolio";
import {
  DEFAULT_STRATEGY, STRATEGY_LABELS, backtestPortfolio, roundTrips, signalWindow,
  type StrategyConfig, type StrategyKind,
} from "@/lib/backtest";
import { useSim } from "@/store/simStore";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

const INPUT =
  "bg-term-bg2 border border-term-border px-2 py-1 text-term-text focus:outline-none focus:border-term-accent";

const KINDS: StrategyKind[] = ["sma-cross", "rsi-bands", "macd-cross", "buy-hold"];

const toTime = (iso: string) =>
  Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;

const INITIAL_CASH = 100_000;

export function BT({ symbol }: { symbol?: string }) {
  const openTab = useWorkspace((s) => s.openTab);
  const simDate = useSim((s) => s.asOf);
  const asOf = simDate ?? todayIso();

  const [sym, setSym] = useState((symbol ?? "SPY").split(",")[0].toUpperCase());
  const [start, setStart] = useState("2010-01-01");
  const [cfg, setCfg] = useState<StrategyConfig>(DEFAULT_STRATEGY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bt-history", sym, start, asOf],
    queryFn: () => fetchHistorical(sym, { start_date: start, end_date: asOf }),
    enabled: sym.trim().length > 0,
    staleTime: 60_000,
  });

  const candles = useMemo(() => data ?? [], [data]);

  /**
   * The rule and buy-and-hold run through the identical engine, so the
   * comparison cannot be flattered by a difference in how they are scored.
   */
  const result = useMemo(() => {
    if (candles.length < 2) return null;
    const window = signalWindow(candles, cfg);
    if (window.length < 2) return null;
    const end = window[window.length - 1].date;
    const prices = { [sym]: window };

    const strat = backtestPortfolio(window, cfg, INITIAL_CASH, sym, sym);
    const stratCurve = buildEquityCurve(strat, prices, end).snapshots;

    const hold = backtestPortfolio(window, { ...cfg, kind: "buy-hold" }, INITIAL_CASH, sym, sym);
    const holdCurve = buildEquityCurve(hold, prices, end).snapshots;

    return {
      dates: stratCurve.map((s) => s.date),
      strategy: stratCurve.map((s) => s.equity),
      hold: holdCurve.map((s) => s.equity),
      stats: summarize(stratCurve.map((s) => s.equity), stratCurve.map((s) => s.date)),
      holdStats: summarize(holdCurve.map((s) => s.equity), holdCurve.map((s) => s.date)),
      trades: strat.trades,
    };
  }, [candles, cfg, sym]);

  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const stratRef = useRef<ISeriesApi<"Line"> | null>(null);
  const holdRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a8a8a", fontFamily: "JetBrains Mono, monospace", fontSize: 11,
      },
      rightPriceScale: { borderColor: "#2a2a2a" },
      timeScale: { borderColor: "#2a2a2a", timeVisible: false },
      grid: {
        vertLines: { color: "rgba(42,42,42,0.5)" },
        horzLines: { color: "rgba(42,42,42,0.5)" },
      },
      autoSize: true,
    });
    stratRef.current = chart.addLineSeries({ color: "#ff8c00", lineWidth: 2, priceLineVisible: false });
    holdRef.current = chart.addLineSeries({
      color: "#6e6e6e", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false,
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!stratRef.current || !holdRef.current) return;
    if (!result) { stratRef.current.setData([]); holdRef.current.setData([]); return; }
    const rebase = (vals: number[]) =>
      vals.map((v, i) => ({ time: toTime(result.dates[i]), value: (v / INITIAL_CASH) * 100 }));
    stratRef.current.setData(rebase(result.strategy));
    holdRef.current.setData(rebase(result.hold));
    chartRef.current?.timeScale().fitContent();
  }, [result]);

  const set = (patch: Partial<StrategyConfig>) => setCfg((c) => ({ ...c, ...patch }));

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">BACKTEST</span>
          <span className="sub-header">
            {STRATEGY_LABELS[cfg.kind]} · {sym} · {start} → {asOf}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-term-accent" /> <span className="text-term-text">STRATEGY</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px bg-term-muted" /> <span className="text-term-muted">BUY &amp; HOLD</span>
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>RULE</span></div>
        <div className="p-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="sub-header">SYMBOL</span>
            <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())}
              className={cn(INPUT, "num uppercase text-term-amberBright w-24")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sub-header">FROM</span>
            <input type="date" value={start} max={asOf}
              onChange={(e) => setStart(e.target.value)} className={cn(INPUT, "num")} />
          </label>

          <div className="flex flex-col gap-1">
            <span className="sub-header">STRATEGY</span>
            <div className="flex">
              {KINDS.map((k) => (
                <button key={k} onClick={() => set({ kind: k })}
                  className={cn("px-2 py-1 border tracking-wider text-[11px]",
                    k === cfg.kind
                      ? "border-term-accent text-term-accent"
                      : "border-term-border text-term-muted hover:text-term-text")}>
                  {STRATEGY_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {cfg.kind === "sma-cross" && (
            <>
              <NumField label="FAST" value={cfg.fast} onChange={(v) => set({ fast: v })} />
              <NumField label="SLOW" value={cfg.slow} onChange={(v) => set({ slow: v })} />
            </>
          )}
          {cfg.kind === "rsi-bands" && (
            <>
              <NumField label="PERIOD" value={cfg.rsiPeriod} onChange={(v) => set({ rsiPeriod: v })} />
              <NumField label="BUY BELOW" value={cfg.rsiBuy} onChange={(v) => set({ rsiBuy: v })} />
              <NumField label="SELL ABOVE" value={cfg.rsiSell} onChange={(v) => set({ rsiSell: v })} />
            </>
          )}

          <div className="sub-header">
            starting cash {fmtPrice(INITIAL_CASH, 0)} · long or flat · no fees or slippage
          </div>
        </div>
      </div>

      {error && <div className="text-term-red">{(error as Error).message}</div>}
      {isLoading && <div className="text-term-muted uppercase text-[11px] tracking-widest">Running…</div>}

      <div className="panel">
        <div className="panel-header">
          <span>GROWTH OF 100</span>
          <span className="sub-header normal-case tracking-normal font-normal">
            {result ? `${candles.length} bars · ${roundTrips(result.trades)} round trips` : "—"}
          </span>
        </div>
        <div className="h-[240px] relative">
          <div ref={host} className="absolute inset-0" />
          {!result && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-term-muted text-[11px] uppercase tracking-widest">
              No bars for {sym} in this window
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <ComparePanel title="RETURN" a={result?.stats} b={result?.holdStats} rows={[
          ["TOTAL", (s) => s.totalReturn, fmtPctFromDecimal],
          ["CAGR", (s) => s.cagr, fmtPctFromDecimal],
          ["HIT RATE", (s) => s.hitRate, fmtPctFromDecimal],
        ]} />
        <ComparePanel title="RISK" a={result?.stats} b={result?.holdStats} rows={[
          ["ANN VOL", (s) => s.annVol, fmtPctFromDecimal],
          ["MAX DD", (s) => s.maxDrawdown, fmtPctFromDecimal],
          ["VAR 95", (s) => s.var95, fmtPctFromDecimal],
        ]} />
        <ComparePanel title="RISK-ADJUSTED" a={result?.stats} b={result?.holdStats} rows={[
          ["SHARPE", (s) => s.sharpe, (v) => (v == null ? "—" : v.toFixed(2))],
          ["SORTINO", (s) => s.sortino, (v) => (v == null ? "—" : v.toFixed(2))],
          ["CALMAR", (s) => s.calmar, (v) => (v == null ? "—" : v.toFixed(2))],
        ]} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>SIGNALS</span>
          <span className="sub-header normal-case tracking-normal font-normal">
            {result?.trades.length ?? 0} fills
          </span>
        </div>
        <div className="overflow-auto scroll-thin max-h-[260px]">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Date</th><th>Side</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(result?.trades ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.date}</td>
                  <td className={cn("num font-semibold", t.side === "BUY" ? "text-term-heading" : "text-term-muted")}>{t.side}</td>
                  <td className="num text-right">{fmtPrice(t.quantity, 0)}</td>
                  <td className="num text-right">{fmtPrice(t.price)}</td>
                  <td className="num text-right text-term-heading">{fmtPrice(t.quantity * t.price)}</td>
                </tr>
              ))}
              {(result?.trades.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="p-4 text-term-muted text-center">The rule never fired in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 border border-term-borderSoft bg-term-panel2 px-3 py-2 text-[11px]">
        <span className="sub-header shrink-0 text-term-amber">CAVEAT</span>
        <span className="text-term-muted leading-relaxed">
          Fills are at the close of the bar the signal appeared on, with no fees, slippage or
          spread, and the rule is tested on the same history it would have been chosen from.
          A backtest that beats buy and hold here has cleared a very low bar.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        <button onClick={() => openTab("TECH", sym)}
          className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
          TECH <span className="text-term-muted normal-case">· Technicals</span>
        </button>
        <button onClick={() => openTab("GP", sym)}
          className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
          GP <span className="text-term-muted normal-case">· Chart</span>
        </button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="sub-header">{label}</span>
      <input type="number" min="1" value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className={cn(INPUT, "num w-20")} />
    </label>
  );
}

type StatPick = [string, (s: PerfSummary) => number | undefined, (v: number | undefined) => string];

function ComparePanel({ title, a, b, rows }: {
  title: string; a?: PerfSummary; b?: PerfSummary; rows: StatPick[];
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title}</span>
        <span className="sub-header normal-case tracking-normal font-normal">rule vs hold</span>
      </div>
      <div className="p-3 grid gap-x-3 gap-y-1 text-[11px]" style={{ gridTemplateColumns: "1fr auto auto" }}>
        {rows.map(([label, pick, format]) => {
          const av = a ? pick(a) : undefined;
          const bv = b ? pick(b) : undefined;
          return (
            <div key={label} className="contents">
              <div className="sub-header py-0.5">{label}</div>
              <div className="num text-right py-0.5 text-term-amber w-20">{format(av)}</div>
              <div className="num text-right py-0.5 text-term-muted w-20">{format(bv)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
