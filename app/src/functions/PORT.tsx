import { type ReactNode } from "react";
import { fmtPrice, fmtPct } from "@/lib/format";
import { weights } from "@/lib/portfolio";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

export function PORT() {
  const { portfolio, asOf, curve, snapshot, rejected, isLoading, error } = usePortfolioData();
  const openTab = useWorkspace((s) => s.openTab);

  if (!portfolio) return <EmptyState />;
  if (error) return <div className="p-6 text-term-red text-[12px]">{error.message}</div>;
  if (isLoading && curve.length === 0) {
    return <div className="p-6 text-term-muted uppercase text-[11px] tracking-widest">Marking the book to {asOf}…</div>;
  }
  if (!snapshot) return <EmptyState />;

  const w = weights(snapshot);
  const prior = curve.length >= 2 ? curve[curve.length - 2] : undefined;
  const dayPnl = prior ? snapshot.equity - prior.equity : undefined;
  const dayPct = prior && prior.equity > 0 ? (snapshot.equity / prior.equity - 1) * 100 : undefined;
  const totalPnl = snapshot.equity - portfolio.initialCash;
  const totalPct = portfolio.initialCash > 0 ? (totalPnl / portfolio.initialCash) * 100 : undefined;
  const realized = snapshot.positions.reduce((s, p) => s + p.realized, 0);

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-start justify-between border-b border-term-border pb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <div className="text-[22px] text-term-amber font-bold tracking-wider">{portfolio.name}</div>
            <div className="sub-header">
              since {portfolio.inceptionDate} · marked {snapshot.date} · vs {portfolio.benchmark}
            </div>
          </div>
          <div className="flex items-baseline gap-4 mt-2">
            <div className="text-3xl num font-bold text-term-heading">{fmtPrice(snapshot.equity)}</div>
            <div className={cn("num text-[14px]", totalPnl >= 0 ? "up" : "down")}>
              {totalPnl >= 0 ? "+" : ""}{fmtPrice(totalPnl)} ({fmtPct(totalPct)})
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] min-w-[280px]">
          <Stat k="CASH" v={fmtPrice(snapshot.cash)} />
          <Stat k="INVESTED" v={fmtPrice(snapshot.positionsValue)} />
          <Stat k="DAY P&L" v={
            <span className={cn(dayPnl != null && (dayPnl >= 0 ? "up" : "down"))}>
              {dayPnl == null ? "—" : `${dayPnl >= 0 ? "+" : ""}${fmtPrice(dayPnl)} (${fmtPct(dayPct)})`}
            </span>
          } />
          <Stat k="REALISED" v={
            <span className={cn(realized !== 0 && (realized > 0 ? "up" : "down"))}>{fmtPrice(realized)}</span>
          } />
        </div>
      </div>

      {rejected.length > 0 && (
        <div className="flex items-start gap-3 border border-term-red bg-term-panel2 px-3 py-2 text-[11px]">
          <span className="sub-header shrink-0 text-term-red">OMITTED</span>
          <span className="text-term-red leading-relaxed">
            {rejected.length} trade{rejected.length === 1 ? "" : "s"} omitted from the book:{" "}
            {rejected.map((r) => `${r.trade.date} ${r.trade.side} ${r.trade.symbol} (${r.reason})`).join("; ")}
          </span>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <span>HOLDINGS</span>
          <span className="sub-header normal-case tracking-normal font-normal">
            {snapshot.positions.length} position{snapshot.positions.length === 1 ? "" : "s"} · click a row for INTEL
          </span>
        </div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Avg Cost</th>
                <th className="text-right">Mark</th>
                <th className="text-right">Cost Basis</th>
                <th className="text-right">Market Value</th>
                <th className="text-right">Weight</th>
                <th className="text-right">Unrealised</th>
                <th className="text-right">Realised</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.positions.map((p) => {
                const mark = snapshot.marks[p.symbol] ?? p.avgCost;
                const value = p.quantity * mark;
                const unreal = value - p.costBasis;
                const unrealPct = p.costBasis > 0 ? (unreal / p.costBasis) * 100 : undefined;
                return (
                  <tr key={p.symbol} onClick={() => openTab("INTEL", p.symbol)} className="cursor-pointer">
                    <td className="num text-term-amber font-semibold">{p.symbol}</td>
                    <td className="num text-right">{fmtPrice(p.quantity, 0)}</td>
                    <td className="num text-right">{fmtPrice(p.avgCost)}</td>
                    <td className="num text-right text-term-heading">{fmtPrice(mark)}</td>
                    <td className="num text-right">{fmtPrice(p.costBasis)}</td>
                    <td className="num text-right text-term-heading">{fmtPrice(value)}</td>
                    <td className="num text-right">{fmtPct((w[p.symbol] ?? 0) * 100)}</td>
                    <td className={cn("num text-right", unreal >= 0 ? "up" : "down")}>
                      {unreal >= 0 ? "+" : ""}{fmtPrice(unreal)}
                      <span className="text-term-muted"> ({fmtPct(unrealPct)})</span>
                    </td>
                    <td className={cn("num text-right", p.realized === 0 ? "text-term-muted" : p.realized > 0 ? "up" : "down")}>
                      {fmtPrice(p.realized)}
                    </td>
                  </tr>
                );
              })}
              {snapshot.positions.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-term-muted text-center">
                    All cash. Open <span className="text-term-amber num">TRADE</span> to buy something.
                  </td>
                </tr>
              )}
            </tbody>
            {snapshot.positions.length > 0 && (
              <tfoot>
                <tr className="border-t border-term-border">
                  <td className="num text-term-muted uppercase tracking-wider text-[10px]">Cash</td>
                  <td colSpan={4} />
                  <td className="num text-right text-term-heading">{fmtPrice(snapshot.cash)}</td>
                  <td className="num text-right">
                    {fmtPct(snapshot.equity > 0 ? (snapshot.cash / snapshot.equity) * 100 : undefined)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 border border-term-borderSoft bg-term-panel2 px-3 py-2 text-[11px]">
        <span className="sub-header shrink-0 text-term-amber">NOTE</span>
        <span className="text-term-muted leading-relaxed">
          The engine models price return only — no dividend reinvestment. Provider closes are
          split adjusted, so a share count entered before a split is measured against a
          post-split price and will read wrong; enter split-adjusted quantities.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[
          { c: "TRADE", label: "Blotter" }, { c: "ALGO", label: "Algos" }, { c: "PERF", label: "Performance" },
          { c: "PSIM", label: "Time Machine" },
        ].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <div className="sub-header">{k}</div>
      <div className="num text-right text-term-text">{v}</div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="p-6 flex flex-col gap-4 max-w-4xl">
      <div>
        <div className="sub-header text-term-amber">NO PORTFOLIO YET</div>
        <div className="text-term-heading text-xl mt-1">Open a simulated book.</div>
        <div className="text-term-text text-[12px] mt-2 leading-relaxed max-w-2xl">
          Set the terminal clock to any past date in <span className="num text-term-amber">PSIM</span>,
          open a portfolio dated there, and buy at that day&apos;s real closing price. Step the clock
          forward and the book marks to market as the tape moves.
        </div>
      </div>
      <PortfolioPicker />
    </div>
  );
}
