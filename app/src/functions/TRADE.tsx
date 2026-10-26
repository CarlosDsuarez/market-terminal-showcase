import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorical } from "@/lib/api";
import { parseIso, toIso } from "@/lib/asOf";
import { fmtPrice } from "@/lib/format";
import { replayBook, sortedTrades, validateTrade, type Side, type Trade } from "@/lib/portfolio";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { usePortfolios } from "@/store/portfolioStore";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

const INPUT =
  "w-full bg-term-bg2 border border-term-border px-2 py-1 text-term-text focus:outline-none focus:border-term-accent";

/** Look back far enough to clear a long weekend or holiday run. */
const PRICE_LOOKBACK_DAYS = 10;

export function TRADE() {
  const { portfolio, asOf, rejected } = usePortfolioData();
  const { addTrade, removeTrade } = usePortfolios();
  const openTab = useWorkspace((s) => s.openTab);
  const activeSymbol = useWorkspace((s) => s.activeSymbol);

  const [symbol, setSymbol] = useState(activeSymbol ?? "AAPL");
  const [side, setSide] = useState<Side>("BUY");
  const [quantity, setQuantity] = useState("100");
  // A manual price is tagged with the symbol and date it was typed for, so
  // changing either re-arms the auto-fill without an effect resetting state.
  const [override, setOverride] = useState<{ key: string; value: string } | null>(null);
  const [fees, setFees] = useState("0");
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // The close on the terminal's current date, which is the fill price.
  const priceQ = useQuery({
    queryKey: ["trade-price", symbol, asOf],
    queryFn: () => {
      const start = parseIso(asOf);
      start.setDate(start.getDate() - PRICE_LOOKBACK_DAYS);
      return fetchHistorical(symbol, { start_date: toIso(start), end_date: asOf });
    },
    enabled: symbol.trim().length > 0,
    staleTime: 60_000,
  });

  const marketBar = useMemo(() => {
    const rows = priceQ.data ?? [];
    return rows.length > 0 ? rows[rows.length - 1] : undefined;
  }, [priceQ.data]);

  const overrideKey = `${symbol}|${asOf}`;
  const isManual = override?.key === overrideKey;
  const price = isManual ? override.value : marketBar ? String(marketBar.close) : "";

  const candidate: Trade | null = useMemo(() => {
    if (!portfolio) return null;
    const q = Number(quantity);
    const p = Number(price);
    if (!Number.isFinite(q) || !Number.isFinite(p) || price === "") return null;
    return {
      id: "candidate",
      date: asOf,
      symbol: symbol.trim().toUpperCase(),
      side,
      quantity: q,
      price: p,
      fees: Number(fees) || 0,
    };
  }, [portfolio, quantity, price, fees, symbol, side, asOf]);

  const check = portfolio && candidate ? validateTrade(portfolio, asOf, candidate) : null;
  const book = portfolio ? replayBook(portfolio, asOf) : null;
  const held = book?.positions[symbol.trim().toUpperCase()]?.quantity ?? 0;

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

  const submit = () => {
    if (!candidate || !check?.ok) return;
    addTrade(portfolio.id, {
      date: candidate.date, symbol: candidate.symbol, side: candidate.side,
      quantity: candidate.quantity, price: candidate.price, fees: candidate.fees,
    });
    setFlash(`${candidate.side} ${candidate.quantity} ${candidate.symbol} @ ${fmtPrice(candidate.price)}`);
  };

  const history = sortedTrades(portfolio.trades).reverse();

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">TRADE BLOTTER</span>
          <span className="sub-header">{portfolio.name}</span>
        </div>
        <div className="sub-header">
          FILLING AT THE CLOSE OF <span className="num text-term-amber">{asOf}</span>
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
        <div className="panel-header"><span>NEW ORDER</span></div>
        <div className="p-3 flex flex-col gap-3">
          <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "1fr 0.8fr 1fr 1fr 0.8fr auto" }}>
            <label className="flex flex-col gap-1">
              <span className="sub-header">SYMBOL</span>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className={cn(INPUT, "num uppercase text-term-amberBright")} />
            </label>

            <div className="flex flex-col gap-1">
              <span className="sub-header">SIDE</span>
              <div className="flex">
                {(["BUY", "SELL"] as Side[]).map((s) => (
                  <button key={s} onClick={() => setSide(s)}
                    className={cn("flex-1 px-2 py-1 border tracking-wider",
                      s === side
                        ? "border-term-accent bg-term-accent text-term-bg font-bold"
                        : "border-term-border text-term-muted hover:text-term-text")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="sub-header">QUANTITY</span>
              <input type="number" min="0" step="1" value={quantity} aria-label="Quantity"
                onChange={(e) => setQuantity(e.target.value)} className={cn(INPUT, "num")} />
              {quantity !== "" && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) && (
                <span className="text-term-red text-[10px]">Enter a quantity greater than 0.</span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="sub-header">
                PRICE {!isManual && marketBar ? "· auto" : "· manual"}
              </span>
              <input type="number" min="0" step="0.01" value={price}
                onChange={(e) => setOverride({ key: overrideKey, value: e.target.value })}
                className={cn(INPUT, "num")} />
            </label>

            <label className="flex flex-col gap-1">
              <span className="sub-header">FEES</span>
              <input type="number" min="0" step="0.01" value={fees} aria-label="Fees"
                onChange={(e) => setFees(e.target.value)} className={cn(INPUT, "num")} />
              {fees !== "" && !Number.isFinite(Number(fees)) && (
                <span className="text-term-red text-[10px]">Fees must be a number (0 if none).</span>
              )}
            </label>

            <button onClick={submit} disabled={!check?.ok}
              className={cn("px-4 py-1 border tracking-[0.18em] text-[11px]",
                check?.ok
                  ? "border-term-accent text-term-accent hover:bg-term-accentSubtle"
                  : "border-term-borderSoft text-term-muted cursor-not-allowed")}>
              SUBMIT
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] num text-term-muted">
            <span>
              CLOSE {marketBar ? <span className="text-term-heading">{fmtPrice(marketBar.close)}</span> : priceQ.isLoading ? "…" : "—"}
              {marketBar && <span className="text-term-muted"> on {marketBar.date}</span>}
            </span>
            <span>CASH <span className="text-term-heading">{fmtPrice(book?.cash)}</span></span>
            <span>HELD <span className="text-term-heading">{fmtPrice(held, 0)}</span> {symbol}</span>
            {candidate && (
              <span>
                {side === "BUY" ? "COST" : "PROCEEDS"}{" "}
                <span className="text-term-heading">
                  {fmtPrice(candidate.quantity * candidate.price + (side === "BUY" ? candidate.fees : -candidate.fees))}
                </span>
              </span>
            )}
          </div>

          {check && !check.ok && (
            <div className="border-l-2 border-term-red bg-term-red/10 px-3 py-1.5 text-term-red text-[11px]">
              REJECTED — {check.reason}
            </div>
          )}
          {flash && (
            <div className="border-l-2 border-term-heading bg-term-accentSubtle px-3 py-1.5 text-term-heading text-[11px]">
              FILLED — {flash}
            </div>
          )}
          {!marketBar && !priceQ.isLoading && symbol.trim() !== "" && (
            <div className="text-term-muted text-[11px]">
              {priceQ.error
                ? `Price lookup failed: ${(priceQ.error as Error).message}. Enter a price by hand to override.`
                : `No bar for ${symbol} on or before ${asOf}. It may not have been listed yet — enter a price by hand to override.`}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>TRADE HISTORY</span>
          <span className="sub-header normal-case tracking-normal font-normal">{portfolio.trades.length} filled</span>
        </div>
        <div className="overflow-auto scroll-thin max-h-[340px]">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Date</th><th>Symbol</th><th>Side</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Fees</th>
                <th className="text-right">Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.date}</td>
                  <td className="num text-term-amber font-semibold">{t.symbol}</td>
                  <td className={cn("num font-semibold", t.side === "BUY" ? "text-term-heading" : "text-term-muted")}>{t.side}</td>
                  <td className="num text-right">{fmtPrice(t.quantity, 0)}</td>
                  <td className="num text-right">{fmtPrice(t.price)}</td>
                  <td className="num text-right text-term-muted">{fmtPrice(t.fees)}</td>
                  <td className="num text-right text-term-heading">{fmtPrice(t.quantity * t.price)}</td>
                  <td className="text-right">
                    {t.algoOrderId ? (
                      <span className="sub-header text-term-amber">{t.note ?? "ALGO"}</span>
                    ) : confirmDeleteId === t.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <button onClick={() => { removeTrade(portfolio.id, t.id); setConfirmDeleteId(null); }}
                          className="text-term-red text-[10px] tracking-wider font-bold">
                          CONFIRM
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-term-muted text-[10px] tracking-wider">
                          KEEP
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(t.id)}
                        className="text-term-muted hover:text-term-red text-[10px] tracking-wider">
                        DELETE
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-term-muted text-center">No trades yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "PORT", label: "Holdings" }, { c: "ALGO", label: "Algos" }, { c: "PERF", label: "Performance" }, { c: "PSIM", label: "Time Machine" }].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
