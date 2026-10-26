import { describe, expect, it } from "vitest";
import type { Candle } from "./api";
import { algoStatus, expandAlgoOrders } from "./algo";
import { buildEquityCurve, symbolsOf, type AlgoOrder, type Portfolio, type Trade } from "./portfolio";

function bars(rows: [date: string, close: number, volume?: number][]): Candle[] {
  return rows.map(([date, close, volume]) => ({
    date, open: close, high: close, low: close, close, volume: volume ?? 1000,
  }));
}

let seq = 0;
function order(over: Partial<AlgoOrder> & Pick<AlgoOrder, "kind" | "quantity">): AlgoOrder {
  return {
    id: over.id ?? `a${++seq}`,
    created: "2020-01-02",
    symbol: "AAPL",
    side: "BUY",
    startDate: "2020-01-02",
    endDate: "2020-01-08",
    ...over,
  };
}

function portfolio(over: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "p1", name: "Test", inceptionDate: "2020-01-01",
    initialCash: 100_000, benchmark: "SPY", trades: [], algoOrders: [], ...over,
  };
}

const WEEK: [string, number, number?][] = [
  ["2020-01-02", 10],
  ["2020-01-03", 10],
  ["2020-01-06", 10],
  ["2020-01-07", 10],
  ["2020-01-08", 10],
];

const prices = { AAPL: bars(WEEK) };

function qtys(fills: Trade[]): number[] {
  return fills.map((t) => t.quantity);
}

describe("expandAlgoOrders — TWAP", () => {
  it("splits equally across sessions and dumps the remainder on the last day", () => {
    const even = expandAlgoOrders(
      portfolio({ algoOrders: [order({ id: "even", kind: "TWAP", quantity: 1000 })] }),
      prices,
      "2020-01-08",
    );
    expect(qtys(even)).toEqual([200, 200, 200, 200, 200]);
    expect(even.every((t) => t.algoOrderId === "even")).toBe(true);
    expect(even.every((t) => t.price === 10 && t.fees === 0 && t.side === "BUY")).toBe(true);

    const lumpy = expandAlgoOrders(
      portfolio({ algoOrders: [order({ id: "lumpy", kind: "TWAP", quantity: 1000, endDate: "2020-01-06" })] }),
      prices,
      "2020-01-06",
    );
    expect(qtys(lumpy)).toEqual([333, 333, 334]);
  });

  it("skips a day with no bar rather than filling a holiday", () => {
    const fills = expandAlgoOrders(
      portfolio({ algoOrders: [order({ kind: "TWAP", quantity: 400, endDate: "2020-01-06" })] }),
      prices,
      "2020-01-06",
    );
    expect(fills.map((t) => t.date)).toEqual(["2020-01-02", "2020-01-03", "2020-01-06"]);
    expect(qtys(fills)).toEqual([133, 133, 134]);
  });
});

describe("expandAlgoOrders — VWAP", () => {
  it("does not use volume after the as-of date", () => {
    // 20 sessions of ADV=1000, then a quiet open and a loud rest of the week.
    const history: [string, number, number?][] = [];
    for (let d = 1; d <= 20; d++) {
      const day = String(d).padStart(2, "0");
      history.push([`2019-12-${day}`, 10, 1000]);
    }
    const window: [string, number, number?][] = [
      ["2020-01-02", 10, 100],
      ["2020-01-03", 10, 100],
      ["2020-01-06", 10, 10_000],
      ["2020-01-07", 10, 10_000],
      ["2020-01-08", 10, 10_000],
    ];
    const px = { AAPL: bars([...history, ...window]) };
    const o = order({ id: "vw", kind: "VWAP", quantity: 1000 });
    const throughDayTwo = expandAlgoOrders(portfolio({ algoOrders: [o] }), px, "2020-01-03");

    // ADV on day 1 = 1000. 1000 * 100 / (100 + 1000*4) = 1000*100/4100 → floor 24.
    // Day 2 remaining 976; ADV rolls in Jan 2's 100 vol → 955.
    // 976 * 100 / (100 + 955*3) = 97600/2965 → floor 32.
    expect(throughDayTwo.map((t) => t.date)).toEqual(["2020-01-02", "2020-01-03"]);
    expect(qtys(throughDayTwo)).toEqual([24, 32]);

    // Peeking at the 10k later days would have given day 1 a tiny slice (~3).
    expect(throughDayTwo[0].quantity).toBeGreaterThan(10);
  });

  it("falls back to TWAP when there is no volume history to form an ADV", () => {
    const fills = expandAlgoOrders(
      portfolio({ algoOrders: [order({ kind: "VWAP", quantity: 1000 })] }),
      prices,
      "2020-01-08",
    );
    expect(qtys(fills)).toEqual([200, 200, 200, 200, 200]);
  });
});

describe("expandAlgoOrders — POV", () => {
  it("caps each session at participation times that day's volume", () => {
    const px = {
      AAPL: bars([
        ["2020-01-02", 10, 1000],
        ["2020-01-03", 10, 1000],
        ["2020-01-06", 10, 1000],
      ]),
    };
    const fills = expandAlgoOrders(
      portfolio({
        algoOrders: [order({
          kind: "POV", quantity: 500, participation: 0.1, endDate: "2020-01-06",
        })],
      }),
      px,
      "2020-01-06",
    );
    // 10% of 1000 = 100 per day; parent 500 so three days fill 100, 100, 100 and leave 200.
    expect(qtys(fills)).toEqual([100, 100, 100]);
    expect(fills.reduce((s, t) => s + t.quantity, 0)).toBe(300);
  });
});

describe("expandAlgoOrders — ICEBERG", () => {
  it("never shows more than the display quantity in one session", () => {
    const fills = expandAlgoOrders(
      portfolio({
        algoOrders: [order({
          kind: "ICEBERG", quantity: 250, displayQty: 50, endDate: "2020-01-08",
        })],
      }),
      prices,
      "2020-01-08",
    );
    expect(fills.every((t) => t.quantity <= 50)).toBe(true);
    expect(qtys(fills)).toEqual([50, 50, 50, 50, 50]);
  });
});

describe("expandAlgoOrders — limit, cancel, rewind, cash", () => {
  it("skips a session the close does not meet and can still fill later", () => {
    const px = {
      AAPL: bars([
        ["2020-01-02", 12],
        ["2020-01-03", 9],
        ["2020-01-06", 8],
      ]),
    };
    const fills = expandAlgoOrders(
      portfolio({
        algoOrders: [order({
          kind: "TWAP", quantity: 90, limit: 10, endDate: "2020-01-06",
        })],
      }),
      px,
      "2020-01-06",
    );
    expect(fills.map((t) => t.date)).toEqual(["2020-01-03", "2020-01-06"]);
    expect(qtys(fills)).toEqual([45, 45]);
  });

  it("produces no fills after the cancel date", () => {
    const fills = expandAlgoOrders(
      portfolio({
        algoOrders: [order({
          kind: "TWAP", quantity: 1000, cancelledOn: "2020-01-03",
        })],
      }),
      prices,
      "2020-01-08",
    );
    expect(fills.map((t) => t.date)).toEqual(["2020-01-02", "2020-01-03"]);
    expect(qtys(fills)).toEqual([200, 200]);
  });

  it("rewinds: fills after as-of are not generated, so they never hit the book", () => {
    const p = portfolio({
      algoOrders: [order({ kind: "TWAP", quantity: 1000 })],
    });
    const early = expandAlgoOrders(p, prices, "2020-01-03");
    expect(early.map((t) => t.date)).toEqual(["2020-01-02", "2020-01-03"]);

    const merged = { ...p, trades: [...p.trades, ...early] };
    const curve = buildEquityCurve(merged, prices, "2020-01-03");
    expect(curve.rejected).toEqual([]);
    expect(curve.snapshots[curve.snapshots.length - 1].positions[0].quantity).toBe(400);
  });

  it("skips a slice the cash cannot cover and leaves the quantity for later", () => {
    const fills = expandAlgoOrders(
      portfolio({
        initialCash: 600,
        algoOrders: [order({ kind: "TWAP", quantity: 100, endDate: "2020-01-03" })],
      }),
      prices,
      "2020-01-03",
    );
    // Day 1: 50 @ 10 = 500, cash left 100. Day 2: 50 @ 10 needs 500 — skip.
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ date: "2020-01-02", quantity: 50 });
  });
});

describe("algoStatus", () => {
  const o = order({ id: "st", kind: "TWAP", quantity: 1000, startDate: "2020-01-06" });

  it("is NEW before the start date, WORKING in the window, FILLED when done", () => {
    expect(algoStatus(o, [], "2020-01-03")).toBe("NEW");
    expect(algoStatus(o, [], "2020-01-06")).toBe("WORKING");
    expect(algoStatus(o, [
      { id: "x", date: "2020-01-06", symbol: "AAPL", side: "BUY", quantity: 1000, price: 10, fees: 0, algoOrderId: "st" },
    ], "2020-01-06")).toBe("FILLED");
  });

  it("is CANCELLED once as-of reaches the cancel date, EXPIRED after the window with leaves", () => {
    expect(algoStatus({ ...o, cancelledOn: "2020-01-07" }, [], "2020-01-07")).toBe("CANCELLED");
    expect(algoStatus(o, [], "2020-01-10")).toBe("EXPIRED");
  });
});

describe("symbolsOf", () => {
  it("includes a working parent with no fills yet", () => {
    const p = portfolio({
      algoOrders: [order({ kind: "TWAP", quantity: 100, symbol: "MSFT" })],
    });
    expect(symbolsOf(p).sort()).toEqual(["MSFT", "SPY"]);
  });
});
