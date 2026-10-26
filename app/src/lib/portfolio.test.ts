import { describe, expect, it } from "vitest";
import type { Candle } from "./api";
import {
  applyTrade, bookAt, buildEquityCurve, emptyBook, symbolsOf, validateTrade, weights,
  type Portfolio, type Trade,
} from "./portfolio";

let seq = 0;
function trade(t: Partial<Trade> & Pick<Trade, "symbol" | "side" | "quantity" | "price">): Trade {
  return { id: `t${++seq}`, date: "2020-01-02", fees: 0, ...t };
}

/** Daily bars on given dates, so calendar gaps are easy to construct. */
function bars(closes: [string, number][]): Candle[] {
  return closes.map(([date, close]) => ({
    date, open: close, high: close, low: close, close, volume: 1000,
  }));
}

function portfolio(over: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "p1", name: "Test", inceptionDate: "2020-01-01",
    initialCash: 100_000, benchmark: "SPY", trades: [], ...over,
  };
}

describe("applyTrade — buys", () => {
  it("records cost basis and pays fees out of cash", () => {
    const r = applyTrade(emptyBook(100_000), trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, fees: 5 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Fees are expensed, not capitalised into the basis.
    expect(r.book.cash).toBeCloseTo(98_995, 6);
    expect(r.book.positions.AAPL.quantity).toBe(100);
    expect(r.book.positions.AAPL.costBasis).toBeCloseTo(1000, 6);
    expect(r.book.positions.AAPL.avgCost).toBeCloseTo(10, 6);
  });

  it("averages cost across lots", () => {
    let book = emptyBook(100_000);
    for (const p of [10, 20]) {
      const r = applyTrade(book, trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: p }));
      if (r.ok) book = r.book;
    }
    expect(book.positions.AAPL.quantity).toBe(200);
    expect(book.positions.AAPL.avgCost).toBeCloseTo(15, 6);
  });

  it("refuses a buy the cash cannot cover", () => {
    const r = applyTrade(emptyBook(500), trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("cash");
  });

  it("allows a buy that spends the cash exactly", () => {
    const r = applyTrade(emptyBook(1000), trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.book.cash).toBeCloseTo(0, 9);
  });

  it("rejects a non-positive quantity", () => {
    expect(applyTrade(emptyBook(1000), trade({ symbol: "AAPL", side: "BUY", quantity: 0, price: 10 })).ok).toBe(false);
    expect(applyTrade(emptyBook(1000), trade({ symbol: "AAPL", side: "BUY", quantity: -5, price: 10 })).ok).toBe(false);
  });
});

describe("applyTrade — sells", () => {
  function twoLots() {
    let book = emptyBook(100_000);
    for (const p of [10, 20]) {
      const r = applyTrade(book, trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: p }));
      if (r.ok) book = r.book;
    }
    return book;
  }

  it("consumes the oldest lot first", () => {
    // 100 @10 then 100 @20; selling 150 @25 takes all of lot one and half of lot two.
    const r = applyTrade(twoLots(), trade({ symbol: "AAPL", side: "SELL", quantity: 150, price: 25 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Cost of sold = 100*10 + 50*20 = 2000; proceeds = 3750.
    expect(r.book.realized).toBeCloseTo(1750, 6);
    expect(r.book.positions.AAPL.quantity).toBeCloseTo(50, 6);
    // What remains is the tail of the second lot, so cost is 20 not the 15 blend.
    expect(r.book.positions.AAPL.avgCost).toBeCloseTo(20, 6);
  });

  it("returns proceeds to cash net of fees", () => {
    const before = twoLots();
    const r = applyTrade(before, trade({ symbol: "AAPL", side: "SELL", quantity: 100, price: 25, fees: 7 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.book.cash - before.cash).toBeCloseTo(100 * 25 - 7, 6);
  });

  it("refuses to sell more than is held, because shorting is unsupported", () => {
    const r = applyTrade(twoLots(), trade({ symbol: "AAPL", side: "SELL", quantity: 500, price: 25 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("only 200 held");
  });

  it("keeps a fully closed position around for its realised P&L", () => {
    const r = applyTrade(twoLots(), trade({ symbol: "AAPL", side: "SELL", quantity: 200, price: 25 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.book.positions.AAPL.quantity).toBe(0);
    expect(r.book.positions.AAPL.realized).toBeCloseTo(200 * 25 - 3000, 6);
  });
});

describe("buildEquityCurve", () => {
  const prices = {
    AAPL: bars([
      ["2020-01-02", 10],
      ["2020-01-03", 12],
      // 2020-01-06 deliberately missing — a holiday or halt.
      ["2020-01-07", 15],
    ]),
  };

  it("marks the position at each day's close", () => {
    const p = portfolio({
      trades: [trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-02" })],
    });
    const curve = buildEquityCurve(p, prices, "2020-01-07").snapshots;
    expect(curve.map((s) => s.date)).toEqual(["2020-01-02", "2020-01-03", "2020-01-07"]);
    // 99,000 cash + 100 shares.
    expect(curve[0].equity).toBeCloseTo(99_000 + 1000, 6);
    expect(curve[1].equity).toBeCloseTo(99_000 + 1200, 6);
    expect(curve[2].equity).toBeCloseTo(99_000 + 1500, 6);
  });

  it("carries a missing bar forward instead of dropping the position", () => {
    const withGap = {
      AAPL: bars([["2020-01-02", 10], ["2020-01-03", 12]]),
      MSFT: bars([["2020-01-02", 50], ["2020-01-03", 50], ["2020-01-06", 60]]),
    };
    const p = portfolio({
      trades: [
        trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-02" }),
        trade({ symbol: "MSFT", side: "BUY", quantity: 10, price: 50, date: "2020-01-02" }),
      ],
    });
    const curve = buildEquityCurve(p, withGap, "2020-01-06").snapshots;
    const last = curve[curve.length - 1];
    expect(last.date).toBe("2020-01-06");
    // AAPL has no 01-06 bar, so it stays marked at its 01-03 close of 12.
    expect(last.marks.AAPL).toBe(12);
    expect(last.positionsValue).toBeCloseTo(100 * 12 + 10 * 60, 6);
  });

  it("ignores a trade dated before inception", () => {
    const p = portfolio({
      inceptionDate: "2020-01-03",
      trades: [trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-02" })],
    });
    const curve = buildEquityCurve(p, prices, "2020-01-07").snapshots;
    expect(curve[curve.length - 1].positions).toHaveLength(0);
    expect(curve[curve.length - 1].equity).toBeCloseTo(100_000, 6);
  });

  it("ignores a trade dated after the as-of date", () => {
    const p = portfolio({
      trades: [trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-07" })],
    });
    const curve = buildEquityCurve(p, prices, "2020-01-03").snapshots;
    expect(curve[curve.length - 1].equity).toBeCloseTo(100_000, 6);
  });

  it("holds a flat line for an all-cash portfolio", () => {
    const curve = buildEquityCurve(portfolio(), prices, "2020-01-07").snapshots;
    expect(curve.every((s) => s.equity === 100_000)).toBe(true);
  });

  it("still produces a starting point with no prices at all", () => {
    const curve = buildEquityCurve(portfolio(), {}, "2020-01-07").snapshots;
    expect(curve).toHaveLength(1);
    expect(curve[0].equity).toBe(100_000);
  });

  it("surfaces later trades that a backdated buy silently invalidated", () => {
    const p = portfolio({
      initialCash: 1000,
      trades: [
        trade({ id: "t1", symbol: "X", side: "BUY", quantity: 10, price: 100, date: "2020-01-02" }),
        trade({ id: "t2", symbol: "X", side: "SELL", quantity: 10, price: 110, date: "2020-01-04" }),
        trade({ id: "t0", symbol: "Y", side: "BUY", quantity: 10, price: 100, date: "2020-01-01" }),
      ],
    });
    const px = {
      X: bars([["2020-01-01", 100], ["2020-01-02", 100], ["2020-01-04", 110]]),
      Y: bars([["2020-01-01", 100], ["2020-01-02", 100], ["2020-01-04", 100]]),
    };
    const { snapshots, rejected } = buildEquityCurve(p, px, "2020-01-04");
    expect(rejected.map((r) => r.trade.id)).toEqual(["t1", "t2"]);
    expect(snapshots[snapshots.length - 1].positions.map((pos) => pos.symbol)).toEqual(["Y"]);
    expect(snapshots[snapshots.length - 1].cash).toBeCloseTo(0, 6);
  });

  it("leaves rejected empty when every trade clears", () => {
    const p = portfolio({
      trades: [trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-02" })],
    });
    expect(buildEquityCurve(p, prices, "2020-01-07").rejected).toEqual([]);
  });
});

describe("validateTrade", () => {
  it("refuses a backdated buy that would invalidate later fills", () => {
    const p = portfolio({
      initialCash: 1000,
      trades: [
        trade({ id: "t1", symbol: "X", side: "BUY", quantity: 10, price: 100, date: "2020-01-02" }),
        trade({ id: "t2", symbol: "X", side: "SELL", quantity: 10, price: 110, date: "2020-01-04" }),
      ],
    });
    const candidate = trade({ id: "candidate", symbol: "Y", side: "BUY", quantity: 10, price: 100, date: "2020-01-01" });
    const r = validateTrade(p, "2020-01-04", candidate);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/2 later trade/);
  });

  it("still accepts a buy that leaves later trades intact", () => {
    const p = portfolio({
      initialCash: 10_000,
      trades: [trade({ id: "t1", symbol: "X", side: "BUY", quantity: 10, price: 100, date: "2020-01-02" })],
    });
    const candidate = trade({ id: "candidate", symbol: "Y", side: "BUY", quantity: 10, price: 100, date: "2020-01-01" });
    expect(validateTrade(p, "2020-01-04", candidate).ok).toBe(true);
  });
});

describe("weights and symbols", () => {
  it("expresses each holding as a share of equity", () => {
    const prices = { AAPL: bars([["2020-01-02", 10]]) };
    const p = portfolio({
      initialCash: 2000,
      trades: [trade({ symbol: "AAPL", side: "BUY", quantity: 100, price: 10, date: "2020-01-02" })],
    });
    const snap = bookAt(p, prices, "2020-01-02");
    // 1000 of stock against 2000 of equity.
    expect(weights(snap).AAPL).toBeCloseTo(0.5, 6);
  });

  it("includes the benchmark in the symbols to fetch", () => {
    const p = portfolio({ trades: [trade({ symbol: "aapl", side: "BUY", quantity: 1, price: 1 })] });
    expect(symbolsOf(p).sort()).toEqual(["AAPL", "SPY"]);
  });
});
