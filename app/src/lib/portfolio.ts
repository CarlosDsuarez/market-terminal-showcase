// Portfolio accounting. Pure functions — no React, no network, no clock.
//
// The engine models price return only: it does not reinvest dividends and does
// not adjust a share count for a split. yfinance closes are already split
// adjusted, so a quantity entered before a split is measured against an adjusted
// price and will read wrong. PORT surfaces that rather than hiding it.

import type { Candle } from "./api";

export type Side = "BUY" | "SELL";

export type AlgoKind = "TWAP" | "VWAP" | "POV" | "ICEBERG";

export interface AlgoOrder {
  id: string;
  /** ISO YYYY-MM-DD — the as-of date when the parent was routed. */
  created: string;
  symbol: string;
  side: Side;
  quantity: number;
  kind: AlgoKind;
  startDate: string;
  endDate: string;
  /** BUY only if close <= limit; SELL only if close >= limit. */
  limit?: number;
  /** ICEBERG clip per session. */
  displayQty?: number;
  /** POV, e.g. 0.10 = 10% of that day's volume. */
  participation?: number;
  /** No slices after this date. */
  cancelledOn?: string;
}

export interface Trade {
  id: string;
  /** ISO YYYY-MM-DD. */
  date: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  fees: number;
  note?: string;
  /** Set on derived ALGO child fills. */
  algoOrderId?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  inceptionDate: string;
  initialCash: number;
  /** Symbol the equity curve is measured against. */
  benchmark: string;
  trades: Trade[];
  /** Parent ALGO orders; child fills are derived, not stored here. */
  algoOrders?: AlgoOrder[];
}

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realized: number;
}

/** One FIFO tax lot: what is left of a single buy. */
interface Lot { quantity: number; price: number; }

export interface Book {
  cash: number;
  positions: Record<string, Position>;
  lots: Record<string, Lot[]>;
  realized: number;
}

export type TradeResult =
  | { ok: true; book: Book }
  | { ok: false; reason: string };

/** Money comparisons need slack or a fully-invested buy fails on float noise. */
const EPSILON = 1e-6;

export const tradeValue = (t: Pick<Trade, "quantity" | "price">) => t.quantity * t.price;

export function emptyBook(cash: number): Book {
  return { cash, positions: {}, lots: {}, realized: 0 };
}

function cloneBook(b: Book): Book {
  const lots: Record<string, Lot[]> = {};
  for (const [k, v] of Object.entries(b.lots)) lots[k] = v.map((l) => ({ ...l }));
  const positions: Record<string, Position> = {};
  for (const [k, v] of Object.entries(b.positions)) positions[k] = { ...v };
  return { cash: b.cash, positions, lots, realized: b.realized };
}

function recompute(book: Book, symbol: string) {
  const lots = book.lots[symbol] ?? [];
  const quantity = lots.reduce((s, l) => s + l.quantity, 0);
  const costBasis = lots.reduce((s, l) => s + l.quantity * l.price, 0);
  const prev = book.positions[symbol];
  if (quantity <= EPSILON) {
    // Keep a closed position around only if it realised something worth showing.
    if (prev && prev.realized !== 0) {
      book.positions[symbol] = { ...prev, quantity: 0, costBasis: 0, avgCost: 0 };
    } else {
      delete book.positions[symbol];
    }
    delete book.lots[symbol];
    return;
  }
  book.positions[symbol] = {
    symbol,
    quantity,
    costBasis,
    avgCost: costBasis / quantity,
    realized: prev?.realized ?? 0,
  };
}

/**
 * Apply one trade, returning a new book or a reason the trade cannot happen.
 * Rejections are values rather than exceptions so the blotter can show them
 * inline next to the field the user got wrong.
 */
export function applyTrade(book: Book, t: Trade): TradeResult {
  if (!Number.isFinite(t.quantity) || t.quantity <= 0) {
    return { ok: false, reason: "Quantity must be greater than zero." };
  }
  if (!Number.isFinite(t.price) || t.price < 0) {
    return { ok: false, reason: "Price must be zero or greater." };
  }
  const fees = Number.isFinite(t.fees) ? t.fees : 0;
  const next = cloneBook(book);
  const symbol = t.symbol.toUpperCase();

  if (t.side === "BUY") {
    const cost = t.quantity * t.price + fees;
    if (cost > next.cash + EPSILON) {
      return {
        ok: false,
        reason: `Needs ${cost.toFixed(2)} but only ${next.cash.toFixed(2)} cash is available.`,
      };
    }
    next.cash -= cost;
    (next.lots[symbol] ??= []).push({ quantity: t.quantity, price: t.price });
    recompute(next, symbol);
    return { ok: true, book: next };
  }

  const held = (next.lots[symbol] ?? []).reduce((s, l) => s + l.quantity, 0);
  if (t.quantity > held + EPSILON) {
    return {
      ok: false,
      reason: `Cannot sell ${t.quantity} ${symbol}; only ${held} held. Shorting is not supported.`,
    };
  }

  // FIFO: the oldest lots are consumed first.
  let remaining = t.quantity;
  let costOfSold = 0;
  const lots = next.lots[symbol] ?? [];
  while (remaining > EPSILON && lots.length > 0) {
    const lot = lots[0];
    const take = Math.min(lot.quantity, remaining);
    costOfSold += take * lot.price;
    lot.quantity -= take;
    remaining -= take;
    if (lot.quantity <= EPSILON) lots.shift();
  }

  const proceeds = t.quantity * t.price - fees;
  const gain = proceeds - costOfSold;
  next.cash += proceeds;
  next.realized += gain;
  const prevRealized = next.positions[symbol]?.realized ?? 0;
  next.lots[symbol] = lots;
  recompute(next, symbol);
  if (next.positions[symbol]) next.positions[symbol].realized = prevRealized + gain;
  else next.positions[symbol] = {
    symbol, quantity: 0, avgCost: 0, costBasis: 0, realized: prevRealized + gain,
  };
  return { ok: true, book: next };
}

export interface Snapshot {
  date: string;
  cash: number;
  positionsValue: number;
  equity: number;
  positions: Position[];
  /** Last close used per symbol, after forward-filling. */
  marks: Record<string, number>;
}

export interface CurveResult {
  snapshots: Snapshot[];
  rejected: { trade: Trade; reason: string }[];
}

/** Trades sorted by date, then by id so the order is stable across reloads. */
export function sortedTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}

/**
 * Walk every trading day from inception to `asOf`, applying trades on their date
 * and marking positions at that day's close.
 *
 * Symbols missing a bar on a given day — holidays, halts, a foreign listing on a
 * different calendar — are carried at their last known close. Skipping them
 * instead would drop the position out of the total and put a hole in the curve.
 */
export function buildEquityCurve(
  portfolio: Portfolio,
  pricesBySymbol: Record<string, Candle[]>,
  asOf: string
): CurveResult {
  const trades = sortedTrades(portfolio.trades).filter(
    (t) => t.date >= portfolio.inceptionDate && t.date <= asOf
  );

  const dates = new Set<string>();
  for (const series of Object.values(pricesBySymbol)) {
    for (const c of series) {
      if (c.date >= portfolio.inceptionDate && c.date <= asOf) dates.add(c.date);
    }
  }
  // A trade can land on a day no held symbol printed a bar; the book still moved.
  for (const t of trades) dates.add(t.date);
  const timeline = [...dates].sort();

  // An all-cash portfolio, or one opened today, still has a starting point.
  if (timeline.length === 0) timeline.push(portfolio.inceptionDate);

  const closeByDate: Record<string, Map<string, number>> = {};
  for (const [symbol, series] of Object.entries(pricesBySymbol)) {
    for (const c of series) {
      (closeByDate[c.date] ??= new Map()).set(symbol, c.close);
    }
  }

  let book = emptyBook(portfolio.initialCash);
  const marks: Record<string, number> = {};
  let ti = 0;
  const out: Snapshot[] = [];
  const rejected: { trade: Trade; reason: string }[] = [];

  for (const date of timeline) {
    while (ti < trades.length && trades[ti].date <= date) {
      const res = applyTrade(book, trades[ti]);
      if (res.ok) book = res.book;
      else rejected.push({ trade: trades[ti], reason: res.reason });
      ti++;
    }

    const todaysCloses = closeByDate[date];
    if (todaysCloses) for (const [sym, close] of todaysCloses) marks[sym] = close;

    const positions = Object.values(book.positions).filter((p) => p.quantity > EPSILON);
    let positionsValue = 0;
    for (const p of positions) {
      // Before the first bar arrives, cost is the only honest mark.
      positionsValue += p.quantity * (marks[p.symbol] ?? p.avgCost);
    }

    out.push({
      date,
      cash: book.cash,
      positionsValue,
      equity: book.cash + positionsValue,
      positions: positions.map((p) => ({ ...p })),
      marks: { ...marks },
    });
  }

  return { snapshots: out, rejected };
}

/** The book as it stands on `asOf`, which is what PORT and TRADE render. */
export function bookAt(
  portfolio: Portfolio,
  pricesBySymbol: Record<string, Candle[]>,
  asOf: string
): Snapshot {
  const { snapshots } = buildEquityCurve(portfolio, pricesBySymbol, asOf);
  return snapshots[snapshots.length - 1];
}

export function weights(s: Snapshot): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.equity <= 0) return out;
  for (const p of s.positions) {
    out[p.symbol] = (p.quantity * (s.marks[p.symbol] ?? p.avgCost)) / s.equity;
  }
  return out;
}

/**
 * Replay the book up to `asOf` without marking it to market. The blotter needs
 * the cash and share counts as they stand, not their value, so this skips the
 * price walk entirely.
 */
export function replayBook(portfolio: Portfolio, asOf: string): Book {
  let book = emptyBook(portfolio.initialCash);
  for (const t of sortedTrades(portfolio.trades)) {
    if (t.date < portfolio.inceptionDate || t.date > asOf) continue;
    const r = applyTrade(book, t);
    if (r.ok) book = r.book;
  }
  return book;
}

/**
 * Would this trade clear? Lets the blotter show the rejection next to the field
 * the user got wrong, rather than accepting a trade the engine will drop later.
 */
export function validateTrade(portfolio: Portfolio, _asOf: string, candidate: Trade): TradeResult {
  if (candidate.date < portfolio.inceptionDate) {
    return { ok: false, reason: `Before this portfolio opened on ${portfolio.inceptionDate}.` };
  }
  const inserted = sortedTrades([...portfolio.trades, candidate]);
  let book = emptyBook(portfolio.initialCash);
  let seenCandidate = false;
  let laterFails = 0;
  let candidateResult: TradeResult | null = null;
  for (const t of inserted) {
    if (t.date < portfolio.inceptionDate) continue;
    const r = applyTrade(book, t);
    if (t.id === candidate.id) {
      candidateResult = r;
      seenCandidate = true;
      if (r.ok) book = r.book;
      continue;
    }
    if (!r.ok) {
      if (seenCandidate) laterFails++;
      continue;
    }
    book = r.book;
  }
  if (candidateResult && !candidateResult.ok) return candidateResult;
  if (laterFails > 0) {
    return {
      ok: false,
      reason: `This backdated trade would invalidate ${laterFails} later trade(s).`,
    };
  }
  return candidateResult ?? { ok: true, book };
}

/** Symbols the portfolio needs prices for, including its benchmark. */
export function symbolsOf(p: Portfolio): string[] {
  const set = new Set<string>(p.trades.map((t) => t.symbol.toUpperCase()));
  for (const o of p.algoOrders ?? []) set.add(o.symbol.toUpperCase());
  if (p.benchmark) set.add(p.benchmark.toUpperCase());
  return [...set];
}
