import { describe, expect, it } from "vitest";
import type { Candle } from "./api";
import {
  DEFAULT_STRATEGY, backtestPortfolio, exposure, generateTrades, roundTrips, signalWindow,
  type StrategyConfig,
} from "./backtest";
import { buildEquityCurve } from "./portfolio";

function bars(closeVals: number[]): Candle[] {
  return closeVals.map((c, i) => {
    const d = new Date(2020, 0, 1 + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: iso, open: c, high: c, low: c, close: c, volume: 1000 };
  });
}

const cfg = (over: Partial<StrategyConfig> = {}): StrategyConfig => ({ ...DEFAULT_STRATEGY, ...over });

describe("exposure", () => {
  it("holds throughout for buy and hold", () => {
    expect(exposure(bars([1, 2, 3]), cfg({ kind: "buy-hold" }))).toEqual([1, 1, 1]);
  });

  it("is long only while the fast average leads", () => {
    // Rise then fall, so the 3-day average crosses above then below the 5-day.
    const prices = [...Array(10).keys()].map((i) => 100 + i)
      .concat([...Array(10).keys()].map((i) => 110 - i * 3));
    const e = exposure(bars(prices), cfg({ kind: "sma-cross", fast: 3, slow: 5 }));
    // Warm-up is silent, then the rising leg is long and the falling leg is flat.
    expect(e.slice(0, 4).every((v) => v === undefined)).toBe(true);
    expect(e[9]).toBe(1);
    expect(e[e.length - 1]).toBe(0);
  });

  it("holds an RSI entry until the exit band, not merely out of the buy band", () => {
    // Fall hard (oversold), then recover slowly through the middle of the range.
    const prices = [...Array(20).keys()].map((i) => 100 - i * 3)
      .concat([...Array(20).keys()].map((i) => 43 + i));
    const e = exposure(bars(prices), cfg({ kind: "rsi-bands", rsiPeriod: 5, rsiBuy: 30, rsiSell: 70 }));
    const entry = e.findIndex((v) => v === 1);
    expect(entry).toBeGreaterThan(0);
    // Once long, it must not immediately drop back to flat on the next bar.
    expect(e[entry + 1]).toBe(1);
  });
});

describe("generateTrades", () => {
  it("spends the cash on whole shares at the next bar's open", () => {
    const trades = generateTrades(bars([10, 10, 10]), cfg({ kind: "buy-hold" }), 1005, "TEST");
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ side: "BUY", quantity: 100, price: 10 });
    expect(trades[0].date).toBe(bars([10, 10, 10])[1].date);
  });

  it("emits nothing when the cash cannot buy a single share", () => {
    expect(generateTrades(bars([1000]), cfg({ kind: "buy-hold" }), 10, "TEST")).toEqual([]);
  });

  it("only trades when the target exposure changes", () => {
    // Buy and hold never changes state after entry, so there is one trade.
    expect(generateTrades(bars(Array(50).fill(10)), cfg({ kind: "buy-hold" }), 1000, "TEST")).toHaveLength(1);
  });

  it("sells the whole position on an exit", () => {
    const prices = [...Array(10).keys()].map((i) => 100 + i)
      .concat([...Array(10).keys()].map((i) => 110 - i * 5));
    const trades = generateTrades(bars(prices), cfg({ kind: "sma-cross", fast: 3, slow: 5 }), 10_000, "TEST");
    const buy = trades.find((t) => t.side === "BUY");
    const sell = trades.find((t) => t.side === "SELL");
    expect(buy).toBeDefined();
    expect(sell).toBeDefined();
    expect(sell!.quantity).toBe(buy!.quantity);
  });

  it("counts completed round trips", () => {
    expect(roundTrips([
      { id: "1", date: "2020-01-01", symbol: "T", side: "BUY", quantity: 1, price: 1, fees: 0 },
      { id: "2", date: "2020-01-02", symbol: "T", side: "SELL", quantity: 1, price: 2, fees: 0 },
    ])).toBe(1);
  });

  it("fills on the bar after the signal, at that bar's open", () => {
    const prices = [...Array(10).keys()].map((i) => 100 + i)
      .concat([...Array(10).keys()].map((i) => 110 - i * 3));
    const candles = bars(prices).map((c) => ({ ...c, open: c.close + 0.5 }));
    const strategy = cfg({ kind: "sma-cross", fast: 3, slow: 5 });
    const e = exposure(candles, strategy);
    const k = e.findIndex((v) => v === 1);
    expect(k).toBeGreaterThan(0);
    const buy = generateTrades(candles, strategy, 10_000, "TEST").find((t) => t.side === "BUY");
    expect(buy?.date).toBe(candles[k + 1].date);
    expect(buy?.price).toBe(candles[k + 1].open);
  });
});

describe("backtestPortfolio", () => {
  it("feeds the shared engine, so buy and hold tracks the price", () => {
    const candles = bars([10, 10, 12, 13, 14]);
    const p = backtestPortfolio(candles, cfg({ kind: "buy-hold" }), 1000, "TEST", "SPY");
    const curve = buildEquityCurve(p, { TEST: candles }, candles[candles.length - 1].date).snapshots;
    const last = curve[curve.length - 1];
    // Fills on bar 2 at open 10, 100 shares, marked at the closing 14.
    expect(last.equity).toBeCloseTo(100 * 14, 6);
  });

  it("dates the portfolio from the first bar", () => {
    const candles = bars([10, 11]);
    expect(backtestPortfolio(candles, cfg(), 1000, "TEST", "SPY").inceptionDate).toBe(candles[0].date);
  });

  it("survives an empty price history", () => {
    expect(backtestPortfolio([], cfg(), 1000, "TEST", "SPY").trades).toEqual([]);
  });
});

describe("signalWindow", () => {
  it("starts at the first bar the rule can speak, not the first price", () => {
    const prices = [...Array(10).keys()].map((i) => 100 + i)
      .concat([...Array(10).keys()].map((i) => 110 - i * 3));
    const candles = bars(prices);
    const strategy = cfg({ kind: "sma-cross", fast: 3, slow: 5 });
    const window = signalWindow(candles, strategy);
    const first = exposure(candles, strategy).findIndex((e) => e != null);
    expect(window[0].date).toBe(candles[first].date);
    expect(window[0].date).not.toBe(candles[0].date);
  });
});
