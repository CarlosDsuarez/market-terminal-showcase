// Execution algos. A parent AlgoOrder is sliced into one child Trade per
// session at that day's close. Fills are derived from the as-of clock so a
// rewind, a cancel, or a +1W skip never has to undo a side effect.
//
// Remaining-session counts use weekdays through the original end date, not
// bars after as-of: volume after as-of is lookahead, the calendar is not.
// Days with no bar (holiday, halt) are skipped and leftover quantity rolls.

import type { Candle } from "./api";
import { parseIso } from "./asOf";
import {
  applyTrade, emptyBook, sortedTrades,
  type AlgoKind, type AlgoOrder, type Book, type Portfolio, type Trade,
} from "./portfolio";

export type AlgoStatus = "NEW" | "WORKING" | "FILLED" | "CANCELLED" | "EXPIRED";

export const ALGO_KINDS: AlgoKind[] = ["TWAP", "VWAP", "POV", "ICEBERG"];

const ADV_WINDOW = 20;

export function lastEligibleDate(order: AlgoOrder, asOf: string): string {
  let last = asOf < order.endDate ? asOf : order.endDate;
  if (order.cancelledOn && order.cancelledOn < last) last = order.cancelledOn;
  return last;
}

/** Monday–Friday dates from `from` through `to`, inclusive. */
export function weekdayCount(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0;
  const d = parseIso(from);
  const end = parseIso(to);
  while (d.getTime() <= end.getTime()) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function meanVolume(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let sum = 0;
  for (const c of candles) sum += c.volume;
  return sum / candles.length;
}

function limitMet(order: AlgoOrder, close: number): boolean {
  if (order.limit == null || !Number.isFinite(order.limit)) return true;
  if (order.side === "BUY") return close <= order.limit;
  return close >= order.limit;
}

/**
 * Integer child quantity for one session. TWAP/VWAP dump leftover shares on
 * the last weekday of the original window so rounding cannot stall the parent.
 * POV and Iceberg never exceed their caps, even on the last day.
 */
export function sliceQuantity(
  order: AlgoOrder,
  remaining: number,
  remainingSessions: number,
  todayVolume: number,
  adv: number,
): number {
  if (remaining <= 0 || remainingSessions <= 0) return 0;

  if (order.kind === "POV") {
    const cap = (order.participation ?? 0) * todayVolume;
    return Math.min(remaining, Math.floor(cap));
  }
  if (order.kind === "ICEBERG") {
    const clip = order.displayQty ?? 0;
    return Math.min(remaining, Math.floor(clip));
  }

  const useTwap = order.kind === "TWAP" || adv <= 0 || todayVolume < 0;
  if (remainingSessions === 1) return remaining;
  if (useTwap) return Math.floor(remaining / remainingSessions);

  const denom = todayVolume + adv * (remainingSessions - 1);
  if (denom <= 0) return Math.floor(remaining / remainingSessions);
  return Math.min(remaining, Math.floor((remaining * todayVolume) / denom));
}

function childTrade(order: AlgoOrder, date: string, quantity: number, price: number): Trade {
  return {
    id: `${order.id}:${date}`,
    date,
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    quantity,
    price,
    fees: 0,
    algoOrderId: order.id,
    note: order.kind,
  };
}

function filledQty(fills: Trade[], orderId: string): number {
  let n = 0;
  for (const t of fills) if (t.algoOrderId === orderId) n += t.quantity;
  return n;
}

export function algoStatus(order: AlgoOrder, fills: Trade[], asOf: string): AlgoStatus {
  const filled = filledQty(fills.filter((t) => t.date <= asOf), order.id);
  if (filled >= order.quantity) return "FILLED";
  if (order.cancelledOn && asOf >= order.cancelledOn) return "CANCELLED";
  if (asOf < order.startDate) return "NEW";
  if (asOf > order.endDate) return "EXPIRED";
  return "WORKING";
}

/**
 * Walk the as-of window and turn every parent into the child fills that would
 * have printed by that date. Manual blotter trades are applied first on each
 * session so cash and inventory match PORT.
 */
export function expandAlgoOrders(
  portfolio: Portfolio,
  pricesBySymbol: Record<string, Candle[]>,
  asOf: string,
): Trade[] {
  const orders = [...(portfolio.algoOrders ?? [])]
    .filter((o) => o.quantity > 0 && o.startDate <= o.endDate)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (orders.length === 0) return [];

  const remaining = new Map(orders.map((o) => [o.id, o.quantity]));
  let book: Book = emptyBook(portfolio.initialCash);
  const manuals = sortedTrades(portfolio.trades).filter(
    (t) => t.date >= portfolio.inceptionDate && t.date <= asOf,
  );

  const dates = new Set<string>();
  for (const t of manuals) dates.add(t.date);
  for (const o of orders) {
    const last = lastEligibleDate(o, asOf);
    const start = o.startDate < portfolio.inceptionDate ? portfolio.inceptionDate : o.startDate;
    const series = pricesBySymbol[o.symbol.toUpperCase()] ?? [];
    for (const c of series) {
      if (c.date >= start && c.date <= last) dates.add(c.date);
    }
  }

  const fills: Trade[] = [];
  let mi = 0;
  for (const date of [...dates].sort()) {
    while (mi < manuals.length && manuals[mi].date <= date) {
      const r = applyTrade(book, manuals[mi]);
      if (r.ok) book = r.book;
      mi++;
    }

    for (const o of orders) {
      const start = o.startDate < portfolio.inceptionDate ? portfolio.inceptionDate : o.startDate;
      const last = lastEligibleDate(o, asOf);
      if (date < start || date > last) continue;

      const series = pricesBySymbol[o.symbol.toUpperCase()] ?? [];
      const today = series.find((c) => c.date === date);
      if (!today) continue;
      if (!limitMet(o, today.close)) continue;

      const rem = remaining.get(o.id) ?? 0;
      if (rem <= 0) continue;

      const remainingSessions = weekdayCount(date, o.endDate);
      const prior = series.filter((c) => c.date < date);
      const adv = meanVolume(prior.slice(-ADV_WINDOW));
      const qty = sliceQuantity(o, rem, remainingSessions, today.volume, adv);
      if (qty <= 0) continue;

      const child = childTrade(o, date, qty, today.close);
      const result = applyTrade(book, child);
      if (!result.ok) continue;
      book = result.book;
      remaining.set(o.id, rem - qty);
      fills.push(child);
    }
  }

  return fills;
}

/** Manual trades plus derived algo children, which is what the book should walk. */
export function portfolioWithAlgoFills(
  portfolio: Portfolio,
  pricesBySymbol: Record<string, Candle[]>,
  asOf: string,
): Portfolio {
  const children = expandAlgoOrders(portfolio, pricesBySymbol, asOf);
  if (children.length === 0) return portfolio;
  return { ...portfolio, trades: [...portfolio.trades, ...children] };
}
