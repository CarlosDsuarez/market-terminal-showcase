import { useMemo } from "react";
import { correlation, returnsByDate } from "@/lib/perf";
import { useSymbolCandles } from "@/hooks/useSymbolCandles";
import { useWatchlist } from "@/store/watchlistStore";
import { activePortfolio, usePortfolios } from "@/store/portfolioStore";
import { useWorkspace } from "@/store/workspaceStore";

/**
 * Correlation is not a price move, so the heat runs on brightness alone: a
 * filled cell for positive coupling, an outlined one for the rarer inverse
 * case, and near-black for uncorrelated.
 */
function cellStyle(v: number | undefined) {
  if (v == null) return { background: "transparent", color: "#6e6e6e" };
  if (v < 0) {
    return {
      background: "transparent",
      boxShadow: `inset 0 0 0 1px rgba(255,255,255,${Math.min(0.8, Math.abs(v) * 0.9)})`,
      color: "#d0d0d0",
    };
  }
  return {
    background: `rgba(255,255,255,${Math.min(0.85, v * 0.85)})`,
    color: v > 0.45 ? "#0a0a0a" : "#d0d0d0",
  };
}

/** A pair needs a real overlap before a correlation means anything. */
const MIN_SHARED_SESSIONS = 20;

export function CORR({ symbol }: { symbol?: string }) {
  const watched = useWatchlist((s) => s.symbols);
  const portfolio = usePortfolios(activePortfolio);
  const openTab = useWorkspace((s) => s.openTab);

  /**
   * An explicit `AAPL,MSFT,NVDA CORR` wins; otherwise the matrix covers what the
   * user already cares about — the holdings plus the watchlist.
   */
  const symbols = useMemo(() => {
    if (symbol) {
      return [...new Set(symbol.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
    }
    const held = new Set(portfolio?.trades.map((t) => t.symbol.toUpperCase()) ?? []);
    return [...new Set([...held, ...watched])].slice(0, 15);
  }, [symbol, portfolio, watched]);

  const { bySymbol, asOf, isLoading, error } = useSymbolCandles(symbols, 365);

  /**
   * Index returns by date rather than position. Zipping by index would silently
   * compare a US close against a foreign one whenever the calendars differ.
   */
  const byDate = useMemo(() => {
    const out: Record<string, Map<string, number>> = {};
    for (const sym of symbols) {
      out[sym] = returnsByDate(bySymbol[sym] ?? []);
    }
    return out;
  }, [symbols, bySymbol]);

  const matrix = useMemo(() =>
    symbols.map((a) =>
      symbols.map((b) => {
        if (a === b) return 1;
        const ma = byDate[a];
        const mb = byDate[b];
        if (!ma || !mb) return undefined;
        const xs: number[] = [];
        const ys: number[] = [];
        for (const [date, v] of ma) {
          const w = mb.get(date);
          if (w == null) continue;
          xs.push(v);
          ys.push(w);
        }
        return xs.length < MIN_SHARED_SESSIONS ? undefined : correlation(xs, ys);
      })
    ), [symbols, byDate]);

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">CORRELATION</span>
          <span className="sub-header">{symbols.length} symbols · daily returns · 1Y to {asOf}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-term-muted">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3" style={cellStyle(-0.9)} /> inverse
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border border-term-border" style={cellStyle(0)} /> none
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3" style={cellStyle(0.95)} /> tight
          </span>
        </div>
      </div>

      {error && <div className="text-term-red">{error.message}</div>}
      {isLoading && <div className="text-term-muted uppercase text-[11px] tracking-widest">Loading returns…</div>}

      {symbols.length === 0 ? (
        <div className="text-term-muted">
          Nothing to correlate. Add symbols in <span className="num text-term-amber">WATCH</span>,
          or run <span className="num text-term-amber">AAPL,MSFT,NVDA CORR</span>.
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span>MATRIX</span>
            <span className="sub-header normal-case tracking-normal font-normal">
              pairs with fewer than {MIN_SHARED_SESSIONS} shared sessions are left blank
            </span>
          </div>
          <div className="overflow-auto scroll-thin">
            <table className="w-full grid-data">
              <thead>
                <tr>
                  <th />
                  {symbols.map((s) => <th key={s} className="text-right num">{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {symbols.map((a, i) => (
                  <tr key={a}>
                    <td className="num text-term-amber font-semibold">{a}</td>
                    {symbols.map((b, j) => {
                      const v = matrix[i][j];
                      return (
                        <td key={b} className="num text-right" style={cellStyle(v)}>
                          {v == null ? "·" : v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 border border-term-borderSoft bg-term-panel2 px-3 py-2 text-[11px]">
        <span className="sub-header shrink-0 text-term-amber">READ IT AS</span>
        <span className="text-term-muted leading-relaxed">
          High correlation means two holdings are one position wearing two names — a book of
          tightly coupled names is far less diversified than its position count suggests.
          Correlations also rise in a selloff, which is exactly when the diversification was
          supposed to help.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "WATCH", label: "Watchlist" }, { c: "RISK", label: "Portfolio Risk" }].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
