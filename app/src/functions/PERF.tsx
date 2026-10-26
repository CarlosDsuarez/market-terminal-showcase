import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  createChart, ColorType, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { fmtPct, fmtPctFromDecimal } from "@/lib/format";
import { summarize } from "@/lib/perf";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

const toTime = (iso: string) =>
  Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;

export function PERF() {
  const { portfolio, curve, prices, isLoading, error } = usePortfolioData();
  const openTab = useWorkspace((s) => s.openTab);

  const dates = useMemo(() => curve.map((s) => s.date), [curve]);
  const values = useMemo(() => curve.map((s) => s.equity), [curve]);

  /**
   * Raw benchmark closes, dated as the provider printed them. Beta/alpha
   * intersect on those dates — forward-fill is only for the overlay chart.
   */
  const benchSeries = useMemo(() => {
    if (!portfolio) return [];
    return prices[portfolio.benchmark.toUpperCase()] ?? [];
  }, [portfolio, prices]);

  /**
   * Buy-and-hold the benchmark, forward-filled onto the portfolio's own dates so
   * the two series line up bar for bar on the chart.
   */
  const bench = useMemo(() => {
    if (benchSeries.length === 0) return [];
    const byDate = new Map(benchSeries.map((c) => [c.date, c.close]));
    const out: number[] = [];
    let last: number | undefined;
    for (const d of dates) {
      last = byDate.get(d) ?? last;
      if (last == null) continue;
      out.push(last);
    }
    return out;
  }, [benchSeries, dates]);

  const stats = useMemo(
    () => summarize(
      values,
      dates,
      benchSeries.length
        ? { values: benchSeries.map((c) => c.close), dates: benchSeries.map((c) => c.date) }
        : undefined,
    ),
    [values, dates, benchSeries]
  );
  const benchStats = useMemo(
    () => (benchSeries.length > 1
      ? summarize(benchSeries.map((c) => c.close), benchSeries.map((c) => c.date))
      : undefined),
    [benchSeries]
  );

  const monthly = useMemo(() => monthlyReturns(dates, values), [dates, values]);

  const chartHost = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const portRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartHost.current) return;
    const chart = createChart(chartHost.current, {
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
      crosshair: {
        vertLine: { color: "#ff8c00", width: 1, style: 3, labelBackgroundColor: "#ff8c00" },
        horzLine: { color: "#ff8c00", width: 1, style: 3, labelBackgroundColor: "#ff8c00" },
      },
      autoSize: true,
    });
    portRef.current = chart.addLineSeries({ color: "#ff8c00", lineWidth: 2, priceLineVisible: false });
    benchRef.current = chart.addLineSeries({
      color: "#6e6e6e", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false,
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!portRef.current || !benchRef.current) return;
    // Both series are rebased to 100 so a 100k book and a 600-point index can
    // share one axis.
    const base = values[0];
    portRef.current.setData(
      base > 0 ? values.map((v, i) => ({ time: toTime(dates[i]), value: (v / base) * 100 })) : []
    );
    const bbase = bench[0];
    benchRef.current.setData(
      bbase > 0 ? bench.map((v, i) => ({ time: toTime(dates[i]), value: (v / bbase) * 100 })) : []
    );
    chartRef.current?.timeScale().fitContent();
  }, [values, bench, dates]);

  if (!portfolio) {
    return (
      <div className="p-6 text-[12px]">
        <div className="sub-header text-term-amber">NO PORTFOLIO</div>
        <div className="text-term-heading text-lg mt-1">
          Open one in <button onClick={() => openTab("PORT")} className="num text-term-amber underline">PORT</button> first.
        </div>
      </div>
    );
  }
  if (error) return <div className="p-6 text-term-red text-[12px]">{error.message}</div>;
  if (isLoading && curve.length === 0) {
    return <div className="p-6 text-term-muted uppercase text-[11px] tracking-widest">Building the equity curve…</div>;
  }

  const excess =
    stats.totalReturn != null && benchStats?.totalReturn != null
      ? stats.totalReturn - benchStats.totalReturn
      : undefined;

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">PERFORMANCE</span>
          <span className="sub-header">
            {portfolio.name} · {dates[0]} → {dates[dates.length - 1]}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-term-accent" /> <span className="text-term-text">PORTFOLIO</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px bg-term-muted" /> <span className="text-term-muted num">{portfolio.benchmark}</span>
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>GROWTH OF 100</span>
          <span className="sub-header normal-case tracking-normal font-normal">both rebased at inception</span>
        </div>
        <div className="h-[260px] relative">
          <div ref={chartHost} className="absolute inset-0" />
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <StatPanel title="RETURN">
          <Row k="TOTAL" v={fmtPctFromDecimal(stats.totalReturn)} tone={stats.totalReturn} />
          <Row k="CAGR" v={fmtPctFromDecimal(stats.cagr)} tone={stats.cagr} />
          <Row k={`${portfolio.benchmark} TOTAL`} v={fmtPctFromDecimal(benchStats?.totalReturn)} tone={benchStats?.totalReturn} />
          <Row k="EXCESS" v={fmtPctFromDecimal(excess)} tone={excess} />
        </StatPanel>

        <StatPanel title="RISK">
          <Row k="ANN VOL" v={fmtPctFromDecimal(stats.annVol)} />
          <Row k="MAX DRAWDOWN" v={fmtPctFromDecimal(stats.maxDrawdown)} tone={stats.maxDrawdown} />
          <Row k="VAR 95 (1D)" v={fmtPctFromDecimal(stats.var95)} tone={stats.var95} />
          <Row k="PEAK → TROUGH" v={
            stats.peakDate ? <span className="text-[10px]">{stats.peakDate} → {stats.troughDate}</span> : "—"
          } />
        </StatPanel>

        {/* Ratios are not signed price moves, so they are reported plain. */}
        <StatPanel title="RISK-ADJUSTED">
          <Row k="SHARPE" v={num(stats.sharpe)} />
          <Row k="SORTINO" v={num(stats.sortino)} />
          <Row k="CALMAR" v={num(stats.calmar)} />
          <Row k="HIT RATE" v={fmtPctFromDecimal(stats.hitRate)} />
        </StatPanel>

        <StatPanel title={`VS ${portfolio.benchmark}`}>
          <Row k="BETA" v={num(stats.beta)} />
          <Row k="ALPHA (ANN)" v={fmtPctFromDecimal(stats.alpha)} tone={stats.alpha} />
          <Row k="R²" v={num(stats.rSquared)} />
          <Row k="BEST / WORST DAY" v={
            <span className="text-[10px]">
              <span className="up">{fmtPctFromDecimal(stats.best)}</span>
              {" / "}
              <span className="down">{fmtPctFromDecimal(stats.worst)}</span>
            </span>
          } />
        </StatPanel>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>MONTHLY RETURNS</span>
          <span className="sub-header normal-case tracking-normal font-normal">portfolio equity, month over month</span>
        </div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Year</th>
                {MONTHS.map((m) => <th key={m} className="text-right">{m}</th>)}
                <th className="text-right">Year</th>
              </tr>
            </thead>
            <tbody>
              {monthly.years.map((y) => (
                <tr key={y}>
                  <td className="num text-term-amber">{y}</td>
                  {MONTHS.map((_, mi) => {
                    const v = monthly.byYear[y]?.[mi];
                    return (
                      <td key={mi} className={cn("num text-right", v == null ? "text-term-muted" : v >= 0 ? "up" : "down")}>
                        {v == null ? "·" : fmtPct(v * 100, 1)}
                      </td>
                    );
                  })}
                  <td className={cn("num text-right font-semibold",
                    monthly.yearTotal[y] == null ? "text-term-muted" : monthly.yearTotal[y]! >= 0 ? "up" : "down")}>
                    {monthly.yearTotal[y] == null ? "·" : fmtPct(monthly.yearTotal[y]! * 100, 1)}
                  </td>
                </tr>
              ))}
              {monthly.years.length === 0 && (
                <tr><td colSpan={14} className="p-4 text-term-muted text-center">Not enough history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "PORT", label: "Holdings" }, { c: "TRADE", label: "Blotter" }, { c: "ALGO", label: "Algos" }, { c: "PSIM", label: "Time Machine" }].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (v?: number) => (v == null ? "—" : v.toFixed(2));

/** Month-end equity, differenced — the calendar view of the same curve. */
function monthlyReturns(dates: string[], values: number[]) {
  const lastOfMonth = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) lastOfMonth.set(dates[i].slice(0, 7), values[i]);

  const keys = [...lastOfMonth.keys()].sort();
  const byYear: Record<string, (number | undefined)[]> = {};
  const yearTotal: Record<string, number | undefined> = {};
  const firstValue = values[0];

  for (let i = 0; i < keys.length; i++) {
    const [y, m] = keys[i].split("-");
    // The opening month is measured from the starting equity, not a prior month.
    const prev = i === 0 ? firstValue : lastOfMonth.get(keys[i - 1])!;
    const cur = lastOfMonth.get(keys[i])!;
    (byYear[y] ??= new Array(12).fill(undefined))[Number(m) - 1] =
      prev > 0 ? cur / prev - 1 : undefined;
  }

  for (const y of Object.keys(byYear)) {
    const months = byYear[y].filter((v): v is number => v != null);
    yearTotal[y] = months.length === 0
      ? undefined
      : months.reduce((acc, r) => acc * (1 + r), 1) - 1;
  }

  return { years: Object.keys(byYear).sort(), byYear, yearTotal };
}

function StatPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-header"><span>{title}</span></div>
      <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">{children}</div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: number }) {
  return (
    <>
      <div className="sub-header py-0.5">{k}</div>
      <div className={cn("num text-right py-0.5",
        tone == null ? "text-term-text" : tone > 0 ? "up" : tone < 0 ? "down" : "text-term-text")}>
        {v}
      </div>
    </>
  );
}
