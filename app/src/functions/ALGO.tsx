import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorical } from "@/lib/api";
import { ALGO_KINDS, algoStatus, expandAlgoOrders, weekdayCount, type AlgoStatus } from "@/lib/algo";
import { parseIso, toIso } from "@/lib/asOf";
import { fmtPrice } from "@/lib/format";
import { replayBook, type AlgoKind, type AlgoOrder, type Side } from "@/lib/portfolio";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { usePortfolios } from "@/store/portfolioStore";
import { useSim } from "@/store/simStore";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

const INPUT =
  "w-full bg-term-bg2 border border-term-border px-2 py-1 text-term-text focus:outline-none focus:border-term-accent";

const LOOKBACK_DAYS = 40;

function plusWeekdays(iso: string, n: number): string {
  const d = parseIso(iso);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return toIso(d);
}

function lookback(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() - days);
  return toIso(d);
}

function statusTone(s: AlgoStatus): string {
  if (s === "FILLED") return "text-term-heading";
  if (s === "WORKING" || s === "NEW") return "text-term-amber";
  if (s === "CANCELLED" || s === "EXPIRED") return "text-term-muted";
  return "text-term-text";
}

export function ALGO() {
  const { portfolio, asOf, prices, rejected } = usePortfolioData();
  const { addAlgoOrder, cancelAlgoOrder } = usePortfolios();
  const openTab = useWorkspace((s) => s.openTab);
  const activeSymbol = useWorkspace((s) => s.activeSymbol);
  const simDate = useSim((s) => s.asOf);

  const [symbol, setSymbol] = useState(activeSymbol ?? "AAPL");
  const [side, setSide] = useState<Side>("BUY");
  const [quantity, setQuantity] = useState("1000");
  const [kind, setKind] = useState<AlgoKind>("TWAP");
  const [startDate, setStartDate] = useState(asOf);
  const [endDate, setEndDate] = useState(plusWeekdays(asOf, 4));
  const [limit, setLimit] = useState("");
  const [displayQty, setDisplayQty] = useState("100");
  const [participationPct, setParticipationPct] = useState("10");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const sym = symbol.trim().toUpperCase();

  const ticketQ = useQuery({
    queryKey: ["algo-ticket", sym, startDate, asOf],
    queryFn: () => fetchHistorical(sym, {
      start_date: lookback(startDate < asOf ? startDate : asOf, LOOKBACK_DAYS),
      end_date: asOf,
    }),
    enabled: sym.length > 0,
    staleTime: 60_000,
  });

  const ticketBars = useMemo(() => ticketQ.data ?? [], [ticketQ.data]);
  const mergedPrices = useMemo(
    () => (sym ? { ...prices, [sym]: ticketBars.length > 0 ? ticketBars : prices[sym] ?? [] } : prices),
    [prices, sym, ticketBars],
  );

  const qty = Number(quantity);
  const limitPx = limit.trim() === "" ? undefined : Number(limit);
  const display = Number(displayQty);
  const participation = Number(participationPct) / 100;

  const routeError = useMemo(() => {
    if (!portfolio) return "Open a portfolio in PORT first.";
    if (!sym) return "Symbol is required.";
    if (!Number.isFinite(qty) || qty <= 0) return "Quantity must be greater than zero.";
    if (startDate > endDate) return "End date is before start date.";
    if (startDate < portfolio.inceptionDate) return `Before this portfolio opened on ${portfolio.inceptionDate}.`;
    if (kind === "ICEBERG" && (!Number.isFinite(display) || display <= 0)) return "Iceberg needs a display quantity.";
    if (kind === "POV" && (!Number.isFinite(participation) || participation <= 0)) return "POV needs a participation percent.";
    if (limitPx != null && (!Number.isFinite(limitPx) || limitPx < 0)) return "Limit must be zero or greater.";
    return null;
  }, [portfolio, sym, qty, startDate, endDate, kind, display, participation, limitPx]);

  const candidate: AlgoOrder | null = useMemo(() => {
    if (routeError || !portfolio) return null;
    return {
      id: "candidate",
      created: asOf,
      symbol: sym,
      side,
      quantity: qty,
      kind,
      startDate,
      endDate,
      limit: limitPx,
      displayQty: kind === "ICEBERG" ? display : undefined,
      participation: kind === "POV" ? participation : undefined,
    };
  }, [routeError, portfolio, asOf, sym, side, qty, kind, startDate, endDate, limitPx, display, participation]);

  const previewFills = useMemo(() => {
    if (!portfolio || !candidate) return [];
    return expandAlgoOrders(
      { ...portfolio, algoOrders: [candidate] },
      mergedPrices,
      asOf,
    );
  }, [portfolio, candidate, mergedPrices, asOf]);

  const sessions = startDate <= endDate ? weekdayCount(startDate, endDate) : 0;
  const book = portfolio ? replayBook(portfolio, asOf) : null;
  const held = book?.positions[sym]?.quantity ?? 0;
  const close = ticketBars.length > 0 ? ticketBars[ticketBars.length - 1] : undefined;

  const orders = portfolio?.algoOrders ?? [];
  const childFills = useMemo(
    () => (portfolio?.trades ?? []).filter((t) => t.algoOrderId),
    [portfolio],
  );

  const selected = orders.find((o) => o.id === selectedId) ?? orders[0];
  const selectedFills = selected
    ? childFills.filter((t) => t.algoOrderId === selected.id)
    : [];

  const workingPastClock = !simDate && orders.some((o) => {
    const st = algoStatus(o, childFills, asOf);
    return (st === "WORKING" || st === "NEW") && o.endDate > asOf;
  });

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

  const route = () => {
    if (!candidate || routeError) return;
    const id = addAlgoOrder(portfolio.id, {
      created: candidate.created,
      symbol: candidate.symbol,
      side: candidate.side,
      quantity: candidate.quantity,
      kind: candidate.kind,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      limit: candidate.limit,
      displayQty: candidate.displayQty,
      participation: candidate.participation,
    });
    setSelectedId(id);
    setFlash(`${candidate.kind} ${candidate.side} ${candidate.quantity} ${candidate.symbol}  ${candidate.startDate} → ${candidate.endDate}`);
    setTimeout(() => setFlash(null), 2500);
  };

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">ALGO</span>
          <span className="sub-header">EXECUTION MANAGEMENT · {portfolio.name}</span>
        </div>
        <div className="sub-header">
          SLICING AT THE CLOSE OF <span className="num text-term-amber">{asOf}</span>
        </div>
      </div>

      {workingPastClock && (
        <div className="flex items-start gap-3 border border-term-amber bg-term-panel2 px-3 py-2 text-[11px]">
          <span className="sub-header shrink-0 text-term-amber">LIVE CLOCK</span>
          <span className="text-term-muted leading-relaxed">
            Today&apos;s session can fill. Remaining slices cannot walk into the future —
            step the clock in{" "}
            <button onClick={() => openTab("PSIM")} className="text-term-amber underline">PSIM</button>
            {" "}to continue.
          </span>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="flex items-start gap-3 border border-term-red bg-term-panel2 px-3 py-2 text-[11px]">
          <span className="sub-header shrink-0 text-term-red">OMITTED</span>
          <span className="text-term-red leading-relaxed">
            {rejected.length} trade{rejected.length === 1 ? "" : "s"} omitted from the book.
          </span>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-header"><span>ORDER TICKET</span></div>
          <div className="p-3 flex flex-col gap-3">
            <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "1fr 0.8fr 1fr" }}>
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
                <input type="number" min="0" step="1" value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} className={cn(INPUT, "num")} />
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="sub-header">ALGO</span>
              <div className="flex flex-wrap">
                {ALGO_KINDS.map((k) => (
                  <button key={k} onClick={() => setKind(k)}
                    className={cn("px-2 py-1 border tracking-wider text-[11px]",
                      k === kind
                        ? "border-term-accent text-term-accent"
                        : "border-term-border text-term-muted hover:text-term-text")}>
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={route} disabled={Boolean(routeError)}
                className={cn("px-4 py-1 border tracking-[0.18em] text-[11px]",
                  routeError
                    ? "border-term-borderSoft text-term-muted cursor-not-allowed"
                    : "border-term-accent text-term-accent hover:bg-term-accentSubtle")}>
                ROUTE
              </button>
              <button onClick={() => { setQuantity("1000"); setLimit(""); setKind("TWAP"); }}
                className="px-4 py-1 border border-term-border text-term-muted tracking-[0.18em] text-[11px] hover:text-term-text">
                RESET
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><span>ALGO PARAMS · {kind}</span></div>
          <div className="p-3 flex flex-col gap-3">
            <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <label className="flex flex-col gap-1">
                <span className="sub-header">START</span>
                <input type="date" value={startDate} max={endDate}
                  onChange={(e) => setStartDate(e.target.value)} className={cn(INPUT, "num")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sub-header">END</span>
                <input type="date" value={endDate} min={startDate}
                  onChange={(e) => setEndDate(e.target.value)} className={cn(INPUT, "num")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sub-header">LIMIT · optional</span>
                <input type="number" min="0" step="0.01" value={limit} placeholder="MKT"
                  onChange={(e) => setLimit(e.target.value)} className={cn(INPUT, "num")} />
              </label>
            </div>
            {kind === "ICEBERG" && (
              <label className="flex flex-col gap-1 max-w-[160px]">
                <span className="sub-header">DISPLAY QTY</span>
                <input type="number" min="1" step="1" value={displayQty}
                  onChange={(e) => setDisplayQty(e.target.value)} className={cn(INPUT, "num")} />
              </label>
            )}
            {kind === "POV" && (
              <label className="flex flex-col gap-1 max-w-[160px]">
                <span className="sub-header">PARTICIPATION %</span>
                <input type="number" min="0" step="0.1" value={participationPct}
                  onChange={(e) => setParticipationPct(e.target.value)} className={cn(INPUT, "num")} />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] num text-term-muted">
              <span>SESSIONS <span className="text-term-heading">{sessions || "—"}</span></span>
              <span>
                SLICE{" "}
                <span className="text-term-heading">
                  {kind === "TWAP" && sessions > 0 ? fmtPrice(qty / sessions, 0) : "varies"}
                </span>
              </span>
              <span>CLOSE {close ? <span className="text-term-heading">{fmtPrice(close.close)}</span> : ticketQ.isLoading ? "…" : "—"}</span>
              <span>CASH <span className="text-term-heading">{fmtPrice(book?.cash)}</span></span>
              <span>HELD <span className="text-term-heading">{fmtPrice(held, 0)}</span> {sym}</span>
              <span>FILLED BY AS-OF <span className="text-term-heading">{previewFills.reduce((s, t) => s + t.quantity, 0)}</span></span>
            </div>
            {routeError && (
              <div className="border-l-2 border-term-red bg-term-red/10 px-3 py-1.5 text-term-red text-[11px]">
                REJECTED — {routeError}
              </div>
            )}
            {flash && (
              <div className="border-l-2 border-term-heading bg-term-accentSubtle px-3 py-1.5 text-term-heading text-[11px]">
                ROUTED — {flash}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>ORDERS</span>
          <span className="sub-header normal-case tracking-normal font-normal">{orders.length} parent{orders.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-auto scroll-thin max-h-[240px]">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Id</th><th>Side</th><th>Symbol</th><th>Algo</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Filled</th>
                <th className="text-right">Leaves</th>
                <th className="text-right">Avg</th>
                <th>Status</th><th>Window</th><th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const mine = childFills.filter((t) => t.algoOrderId === o.id);
                const filled = mine.reduce((s, t) => s + t.quantity, 0);
                const value = mine.reduce((s, t) => s + t.quantity * t.price, 0);
                const st = algoStatus(o, mine, asOf);
                const active = selected?.id === o.id;
                return (
                  <tr key={o.id} onClick={() => setSelectedId(o.id)}
                    className={cn("cursor-pointer", active && "bg-term-accentSubtle")}>
                    <td className="num text-term-muted">{o.id.slice(0, 8)}</td>
                    <td className={cn("num font-semibold", o.side === "BUY" ? "text-term-heading" : "text-term-muted")}>{o.side}</td>
                    <td className="num text-term-amber font-semibold">{o.symbol}</td>
                    <td className="num">{o.kind}</td>
                    <td className="num text-right">{fmtPrice(o.quantity, 0)}</td>
                    <td className="num text-right">{fmtPrice(filled, 0)}</td>
                    <td className="num text-right">{fmtPrice(Math.max(0, o.quantity - filled), 0)}</td>
                    <td className="num text-right">{filled > 0 ? fmtPrice(value / filled) : "—"}</td>
                    <td className={cn("num font-semibold", statusTone(st))}>{st}</td>
                    <td className="num text-term-muted">{o.startDate} → {o.endDate}</td>
                    <td className="text-right">
                      {(st === "WORKING" || st === "NEW") && (
                        <button onClick={(e) => { e.stopPropagation(); cancelAlgoOrder(portfolio.id, o.id, asOf); }}
                          className="text-term-muted hover:text-term-red text-[10px] tracking-wider">
                          CANCEL
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr><td colSpan={11} className="p-4 text-term-muted text-center">No parent orders. Route a TWAP, VWAP, POV or Iceberg.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>EXECUTIONS</span>
          <span className="sub-header normal-case tracking-normal font-normal">
            {selected ? `${selected.kind} ${selected.symbol} · ${selectedFills.length} child fill${selectedFills.length === 1 ? "" : "s"}` : "select a parent"}
          </span>
        </div>
        <div className="overflow-auto scroll-thin max-h-[220px]">
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
              {selectedFills.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.date}</td>
                  <td className={cn("num font-semibold", t.side === "BUY" ? "text-term-heading" : "text-term-muted")}>{t.side}</td>
                  <td className="num text-right">{fmtPrice(t.quantity, 0)}</td>
                  <td className="num text-right">{fmtPrice(t.price)}</td>
                  <td className="num text-right text-term-heading">{fmtPrice(t.quantity * t.price)}</td>
                </tr>
              ))}
              {selected && selectedFills.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-term-muted text-center">
                    No child fills yet — step the clock in PSIM.
                  </td>
                </tr>
              )}
              {!selected && (
                <tr><td colSpan={5} className="p-4 text-term-muted text-center">Select a parent order.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 border border-term-borderSoft bg-term-panel2 px-3 py-2 text-[11px]">
        <span className="sub-header shrink-0 text-term-amber">CAVEAT</span>
        <span className="text-term-muted leading-relaxed">
          One child fill per session at that day&apos;s close — not an intraday TWAP/VWAP.
          No fees, slippage or spread. Volume-based algos use that day&apos;s volume only
          at the close, never bars after the as-of date.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[{ c: "TRADE", label: "Blotter" }, { c: "PORT", label: "Holdings" }, { c: "PSIM", label: "Time Machine" }, { c: "PERF", label: "Performance" }].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
