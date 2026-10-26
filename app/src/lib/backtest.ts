// Rule backtesting.
//
// A strategy is turned into an ordinary Trade[] and handed to the same
// buildEquityCurve and perf functions the hand-entered portfolio uses. That is
// deliberate: a backtest and a real book are then scored by identical
// arithmetic, and a bug in the engine shows up in both rather than in one.

import type { Candle } from "./api";
import { closes, macd, rsi, sma, type Series } from "./indicators";
import type { Portfolio, Trade } from "./portfolio";

export type StrategyKind = "buy-hold" | "sma-cross" | "rsi-bands" | "macd-cross";

export interface StrategyConfig {
  kind: StrategyKind;
  fast: number;
  slow: number;
  rsiPeriod: number;
  rsiBuy: number;
  rsiSell: number;
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  kind: "sma-cross", fast: 50, slow: 200, rsiPeriod: 14, rsiBuy: 30, rsiSell: 70,
};

export const STRATEGY_LABELS: Record<StrategyKind, string> = {
  "buy-hold": "Buy & hold",
  "sma-cross": "SMA cross",
  "rsi-bands": "RSI bands",
  "macd-cross": "MACD cross",
};

/**
 * Target exposure per bar: 1 to be long, 0 to be flat, undefined while the
 * indicator is still warming up and the rule has nothing to say.
 */
export function exposure(candles: Candle[], cfg: StrategyConfig): (0 | 1 | undefined)[] {
  const n = candles.length;
  const c = closes(candles);
  const out: (0 | 1 | undefined)[] = new Array(n).fill(undefined);

  if (cfg.kind === "buy-hold") {
    for (let i = 0; i < n; i++) out[i] = 1;
    return out;
  }

  if (cfg.kind === "sma-cross") {
    const fast = sma(c, cfg.fast);
    const slow = sma(c, cfg.slow);
    for (let i = 0; i < n; i++) {
      const f = fast[i];
      const s = slow[i];
      if (f == null || s == null) continue;
      out[i] = f > s ? 1 : 0;
    }
    return out;
  }

  if (cfg.kind === "macd-cross") {
    const m = macd(c);
    for (let i = 0; i < n; i++) {
      const line = m.macd[i];
      const sig = m.signal[i];
      if (line == null || sig == null) continue;
      out[i] = line > sig ? 1 : 0;
    }
    return out;
  }

  // RSI bands are stateful: buy when oversold, and hold until overbought rather
  // than flipping back the moment RSI leaves the band.
  const r: Series = rsi(c, cfg.rsiPeriod);
  let held: 0 | 1 = 0;
  for (let i = 0; i < n; i++) {
    const v = r[i];
    if (v == null) continue;
    if (held === 0 && v < cfg.rsiBuy) held = 1;
    else if (held === 1 && v > cfg.rsiSell) held = 0;
    out[i] = held;
  }
  return out;
}

/**
 * Convert target exposure into trades. Entries spend the cash available at that
 * bar's close on whole shares; exits sell the whole position. Trading only on a
 * change of state keeps the blotter to the decisions the rule actually made.
 */
export function generateTrades(
  candles: Candle[],
  cfg: StrategyConfig,
  initialCash: number,
  symbol: string
): Trade[] {
  const target = exposure(candles, cfg);
  const trades: Trade[] = [];
  let cash = initialCash;
  let shares = 0;
  let prev: 0 | 1 = 0;
  let seq = 0;

  for (let i = 1; i < candles.length; i++) {
    const want = target[i - 1];
    if (want == null || want === prev) continue;
    const price = candles[i].open > 0 ? candles[i].open : candles[i].close;
    if (price <= 0) continue;

    if (want === 1) {
      const qty = Math.floor(cash / price);
      if (qty <= 0) continue;
      cash -= qty * price;
      shares += qty;
      trades.push({
        id: `bt-${++seq}`, date: candles[i].date, symbol,
        side: "BUY", quantity: qty, price, fees: 0,
      });
    } else {
      if (shares <= 0) { prev = 0; continue; }
      cash += shares * price;
      trades.push({
        id: `bt-${++seq}`, date: candles[i].date, symbol,
        side: "SELL", quantity: shares, price, fees: 0,
      });
      shares = 0;
    }
    prev = want;
  }

  return trades;
}

/** First bar the rule can speak, so a strategy and buy-and-hold share a window. */
export function signalWindow(candles: Candle[], cfg: StrategyConfig): Candle[] {
  const first = exposure(candles, cfg).findIndex((e) => e != null);
  return first >= 0 ? candles.slice(first) : candles;
}

export function backtestPortfolio(
  candles: Candle[],
  cfg: StrategyConfig,
  initialCash: number,
  symbol: string,
  benchmark: string
): Portfolio {
  return {
    id: "backtest",
    name: `${STRATEGY_LABELS[cfg.kind]} · ${symbol}`,
    inceptionDate: candles[0]?.date ?? "",
    initialCash,
    benchmark,
    trades: generateTrades(candles, cfg, initialCash, symbol),
  };
}

/** Number of round trips, which is what "how much did this trade" really asks. */
export function roundTrips(trades: Trade[]): number {
  return trades.filter((t) => t.side === "SELL").length;
}
