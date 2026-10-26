import { useMemo, useState } from "react";
import { fmtPct, fmtPrice, fmtVolume } from "@/lib/format";
import { closes, latest, rsi, sma } from "@/lib/indicators";
import { sigRSI, sigCross, sigMA, tally } from "@/lib/signals";
import { useSymbolCandles } from "@/hooks/useSymbolCandles";
import { useWatchlist } from "@/store/watchlistStore";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

export function WATCH() {
  const { symbols, add, remove } = useWatchlist();
  const openTab = useWorkspace((s) => s.openTab);
  const [entry, setEntry] = useState("");

  const { bySymbol, asOf, isLoading, error } = useSymbolCandles(symbols, 365);

  const rows = useMemo(() => symbols.map((sym) => {
    const candles = bySymbol[sym] ?? [];
    const c = closes(candles);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const chgPct = last && prev && prev.close !== 0
      ? (last.close / prev.close - 1) * 100
      : undefined;

    const r = latest(rsi(c, 14));
    const s50 = latest(sma(c, 50));
    const s200 = latest(sma(c, 200));
    const signals = [sigRSI(r), sigMA(last?.close, s50, "50d MA"), sigCross(s50, s200)];

    return {
      sym,
      last: last?.close,
      date: last?.date,
      chgPct,
      volume: last?.volume,
      rsi: r,
      verdict: tally(signals).verdict,
      bars: candles.length,
    };
  }), [symbols, bySymbol]);

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">WATCHLIST</span>
          <span className="sub-header">{symbols.length} symbols · as of {asOf}</span>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); add(entry); setEntry(""); }}
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value.toUpperCase())}
            placeholder="ADD SYMBOL"
            className="bg-term-bg2 border border-term-border px-2 py-1 num uppercase text-term-amberBright placeholder:text-term-muted focus:outline-none focus:border-term-accent w-32"
          />
          <button type="submit"
            className="px-2 py-1 border border-term-accent text-term-accent hover:bg-term-accentSubtle tracking-wider text-[11px]">
            ADD
          </button>
        </form>
      </div>

      {error && <div className="text-term-red">{error.message}</div>}

      <div className="panel">
        <div className="panel-header">
          <span>MONITOR</span>
          <span className="sub-header normal-case tracking-normal font-normal">click a row for INTEL</span>
        </div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="text-right">Last</th>
                <th className="text-right">Change</th>
                <th className="text-right">Volume</th>
                <th className="text-right">RSI 14</th>
                <th>Technical read</th>
                <th className="text-right">Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sym} onClick={() => openTab("INTEL", r.sym)} className="cursor-pointer">
                  <td className="num text-term-amber font-semibold">{r.sym}</td>
                  <td className="num text-right text-term-heading">{fmtPrice(r.last)}</td>
                  <td className={cn("num text-right", r.chgPct == null ? "text-term-muted" : r.chgPct >= 0 ? "up" : "down")}>
                    {fmtPct(r.chgPct)}
                  </td>
                  <td className="num text-right text-term-muted">{fmtVolume(r.volume)}</td>
                  {/* RSI and a verdict are readings, not price moves: no colour. */}
                  <td className={cn("num text-right",
                    r.rsi == null ? "text-term-muted"
                      : r.rsi < 30 || r.rsi > 70 ? "text-term-heading font-semibold"
                      : "text-term-text")}>
                    {r.rsi == null ? "—" : r.rsi.toFixed(1)}
                  </td>
                  <td className={cn(
                    r.verdict === "Bullish" && "text-term-heading",
                    r.verdict === "Bearish" && "text-term-text",
                    (r.verdict === "Mixed" || r.verdict === "Sparse") && "text-term-muted"
                  )}>
                    {r.bars === 0 && isLoading ? "…" : r.verdict}
                  </td>
                  <td className="num text-right text-term-muted">{r.date ?? "—"}</td>
                  <td className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(r.sym); }}
                      className="text-term-muted hover:text-term-red text-[10px] tracking-wider">
                      REMOVE
                    </button>
                  </td>
                </tr>
              ))}
              {symbols.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-term-muted text-center">Watchlist is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "CORR", label: "Correlations" }, { c: "SCR", label: "Screener" }, { c: "COMP", label: "Compare" }].map((x) => (
          <button key={x.c}
            onClick={() => openTab(x.c as never, x.c === "COMP" ? symbols.slice(0, 5).join(",") : undefined)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
