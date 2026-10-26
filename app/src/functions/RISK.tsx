import { type ReactNode, useMemo } from "react";
import { fmtPct, fmtPctFromDecimal, fmtPrice } from "@/lib/format";
import { alignByDate, annVol, correlation, dailyReturns, datedReturns, returnsByDate, summarize } from "@/lib/perf";
import { weights } from "@/lib/portfolio";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

export function RISK() {
  const { portfolio, curve, prices, snapshot, isLoading, error } = usePortfolioData();
  const openTab = useWorkspace((s) => s.openTab);

  const dates = useMemo(() => curve.map((s) => s.date), [curve]);
  const values = useMemo(() => curve.map((s) => s.equity), [curve]);

  const benchSeries = useMemo(() => {
    if (!portfolio) return [];
    return prices[portfolio.benchmark.toUpperCase()] ?? [];
  }, [portfolio, prices]);

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

  /**
   * Per-position risk. A weight says how much is at stake; weight times the
   * name's own volatility says how much it actually moves the book, which is
   * usually a very different ranking.
   */
  const positions = useMemo(() => {
    if (!snapshot) return [];
    const w = weights(snapshot);
    const portMap = new Map(datedReturns(values, dates).map((x) => [x.date, x.ret]));
    return snapshot.positions.map((p) => {
      const candles = prices[p.symbol] ?? [];
      const rets = dailyReturns(candles.map((c) => c.close));
      const vol = annVol(rets);
      const weight = w[p.symbol] ?? 0;
      const mark = snapshot.marks[p.symbol] ?? p.avgCost;
      const aligned = alignByDate(returnsByDate(candles), portMap);
      return {
        symbol: p.symbol,
        weight,
        value: p.quantity * mark,
        vol,
        contribution: vol != null ? weight * vol : undefined,
        corrToPortfolio:
          aligned.dates.length >= 20 ? correlation(aligned.a, aligned.b) : undefined,
      };
    }).sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
  }, [snapshot, prices, values, dates]);

  const concentration = useMemo(() => {
    if (!snapshot) return { top5: 0, herfindahl: 0 };
    const w = Object.values(weights(snapshot)).sort((a, b) => b - a);
    return {
      top5: w.slice(0, 5).reduce((a, b) => a + b, 0),
      // Herfindahl: 1 is a single position, 1/n is n equal ones.
      herfindahl: w.reduce((a, b) => a + b * b, 0),
    };
  }, [snapshot]);

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
    return <div className="p-6 text-term-muted uppercase text-[11px] tracking-widest">Measuring risk…</div>;
  }

  const effectiveNames = concentration.herfindahl > 0 ? 1 / concentration.herfindahl : 0;

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">RISK</span>
          <span className="sub-header">{portfolio.name} · {dates[0]} → {dates[dates.length - 1]}</span>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <Panel title="VOLATILITY">
          <Row k="ANNUALISED" v={fmtPctFromDecimal(stats.annVol)} />
          <Row k="VAR 95 (1D)" v={fmtPctFromDecimal(stats.var95)} tone={stats.var95} />
          <Row k="WORST DAY" v={fmtPctFromDecimal(stats.worst)} tone={stats.worst} />
          <Row k="BEST DAY" v={fmtPctFromDecimal(stats.best)} tone={stats.best} />
        </Panel>

        <Panel title="DRAWDOWN">
          <Row k="MAX" v={fmtPctFromDecimal(stats.maxDrawdown)} tone={stats.maxDrawdown} />
          <Row k="PEAK" v={<span className="text-[10px]">{stats.peakDate ?? "—"}</span>} />
          <Row k="TROUGH" v={<span className="text-[10px]">{stats.troughDate ?? "—"}</span>} />
          <Row k="CALMAR" v={stats.calmar == null ? "—" : stats.calmar.toFixed(2)} />
        </Panel>

        <Panel title={`VS ${portfolio.benchmark}`}>
          <Row k="BETA" v={stats.beta == null ? "—" : stats.beta.toFixed(2)} />
          <Row k="ALPHA (ANN)" v={fmtPctFromDecimal(stats.alpha)} tone={stats.alpha} />
          <Row k="R²" v={stats.rSquared == null ? "—" : stats.rSquared.toFixed(2)} />
          <Row k="SHARPE" v={stats.sharpe == null ? "—" : stats.sharpe.toFixed(2)} />
        </Panel>

        <Panel title="CONCENTRATION">
          <Row k="POSITIONS" v={String(snapshot?.positions.length ?? 0)} />
          <Row k="TOP 5 WEIGHT" v={fmtPctFromDecimal(concentration.top5)} />
          <Row k="HERFINDAHL" v={concentration.herfindahl.toFixed(3)} />
          <Row k="EFFECTIVE NAMES" v={effectiveNames === 0 ? "—" : effectiveNames.toFixed(1)} />
        </Panel>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>RISK BY POSITION</span>
          <span className="sub-header normal-case tracking-normal font-normal">
            ranked by weight × own volatility
          </span>
        </div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="text-right">Market Value</th>
                <th className="text-right">Weight</th>
                <th className="text-right">Own Vol (ann)</th>
                <th className="text-right">Risk Contribution</th>
                <th className="text-right">Corr to Book</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} onClick={() => openTab("INTEL", p.symbol)} className="cursor-pointer">
                  <td className="num text-term-amber font-semibold">{p.symbol}</td>
                  <td className="num text-right text-term-heading">{fmtPrice(p.value)}</td>
                  <td className="num text-right">{fmtPct(p.weight * 100)}</td>
                  <td className="num text-right">{fmtPctFromDecimal(p.vol)}</td>
                  <td className="num text-right text-term-amber">{fmtPctFromDecimal(p.contribution)}</td>
                  <td className="num text-right text-term-muted">
                    {p.corrToPortfolio == null ? "—" : p.corrToPortfolio.toFixed(2)}
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-term-muted text-center">No positions to measure.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 border border-term-borderSoft bg-term-panel2 px-3 py-2 text-[11px]">
        <span className="sub-header shrink-0 text-term-amber">CAVEAT</span>
        <span className="text-term-muted leading-relaxed">
          VaR here is the empirical 5th percentile of realised daily returns over this window —
          it describes what already happened, not a bound on what can. Effective names is
          1/Herfindahl: a book of ten positions with one at 60% has the diversification of about
          three.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "PERF", label: "Performance" }, { c: "CORR", label: "Correlations" }, { c: "PORT", label: "Holdings" }].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
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
