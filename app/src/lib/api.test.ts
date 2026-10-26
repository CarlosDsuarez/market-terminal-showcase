import { afterEach, describe, expect, it, vi } from "vitest";
import { setAsOfDate } from "./asOf";
import {
  fetchCompareGroups, fetchEquityHistoricalBatch, fetchHistorical, fetchMetrics, fetchProfile,
  fetchScreener, isoDaysAgo,
} from "./api";

function stubResults(results: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results }) })),
  );
}

/** Capture the URL the api layer actually requested. */
function lastUrl(): URL {
  const mock = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock;
  return new URL(mock.calls[mock.calls.length - 1][0], "http://localhost");
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAsOfDate(null);
});

describe("the simulation clamp", () => {
  it("sends no end_date while the terminal is live", async () => {
    stubResults([]);
    await fetchHistorical("AAPL");
    expect(lastUrl().searchParams.get("end_date")).toBeNull();
  });

  it("clamps a time-bounded endpoint to the simulation date", async () => {
    setAsOfDate("2015-03-02");
    stubResults([]);
    await fetchHistorical("AAPL");
    expect(lastUrl().searchParams.get("end_date")).toBe("2015-03-02");
  });

  it("leaves an explicit window alone", async () => {
    setAsOfDate("2015-03-02");
    stubResults([]);
    await fetchHistorical("AAPL", { start_date: "2010-01-01", end_date: "2012-01-01" });
    expect(lastUrl().searchParams.get("end_date")).toBe("2012-01-01");
  });

  it("never clamps an endpoint that does not accept end_date", async () => {
    // OpenBB validates query params, so an unexpected end_date answers 422.
    setAsOfDate("2015-03-02");
    stubResults([{ symbol: "AAPL" }]);
    await fetchMetrics("AAPL");
    expect(lastUrl().searchParams.get("end_date")).toBeNull();
  });
});

describe("isoDaysAgo", () => {
  it("counts back from today while live", () => {
    setAsOfDate(null);
    expect(isoDaysAgo(0)).toBe(new Date().toLocaleDateString("en-CA"));
  });

  it("counts back from the simulation date instead", () => {
    setAsOfDate("2015-03-02");
    expect(isoDaysAgo(0)).toBe("2015-03-02");
    expect(isoDaysAgo(1)).toBe("2015-03-01");
    expect(isoDaysAgo(30)).toBe("2015-01-31");
  });

  it("defaults a historical request to a window ending at the simulation date", async () => {
    setAsOfDate("2015-03-02");
    stubResults([]);
    await fetchHistorical("AAPL");
    const u = lastUrl();
    expect(u.searchParams.get("start_date")).toBe("2014-01-26");
    expect(u.searchParams.get("end_date")).toBe("2015-03-02");
  });
});

describe("fetchEquityHistoricalBatch", () => {
  const bar = (date: string, close: number, symbol?: string) => ({
    date, open: close, high: close, low: close, close, volume: 1, ...(symbol ? { symbol } : {}),
  });

  it("buckets a multi-symbol answer by its symbol tag", async () => {
    stubResults([bar("2020-01-02", 75, "AAPL"), bar("2020-01-02", 324, "SPY")]);
    const out = await fetchEquityHistoricalBatch(["AAPL", "SPY"]);
    expect(out.AAPL.map((c) => c.close)).toEqual([75]);
    expect(out.SPY.map((c) => c.close)).toEqual([324]);
  });

  it("attributes an untagged single-symbol answer to that symbol", async () => {
    // A one-symbol request answers without a `symbol` field on each row. Bucketing
    // blindly would leave the series empty and mark the position at cost forever.
    stubResults([bar("2020-01-02", 324), bar("2020-01-03", 322)]);
    const out = await fetchEquityHistoricalBatch(["SPY"]);
    expect(out.SPY.map((c) => c.close)).toEqual([324, 322]);
  });

  it("sorts each series by date regardless of the order returned", async () => {
    stubResults([bar("2020-01-03", 322), bar("2020-01-02", 324)]);
    const out = await fetchEquityHistoricalBatch(["SPY"]);
    expect(out.SPY.map((c) => c.date)).toEqual(["2020-01-02", "2020-01-03"]);
  });

  it("asks for nothing when there are no symbols", async () => {
    stubResults([]);
    expect(await fetchEquityHistoricalBatch([])).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("unsettled bars", () => {
  const bar = (date: string, close: number | null) => ({
    date, open: 100, high: 101, low: 99, close, volume: 1000,
  });

  it("drops a trailing bar the provider has not closed yet", async () => {
    // yfinance returns the session in progress with close: null. Kept, it reads
    // as a missing price and CC renders every index at -100%.
    stubResults([bar("2026-08-14", 7700), bar("2026-08-17", null)]);
    const rows = await fetchHistorical("^GSPC");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-08-14");
  });

  it("keeps a complete series untouched", async () => {
    stubResults([bar("2026-08-13", 7690), bar("2026-08-14", 7700)]);
    expect(await fetchHistorical("^GSPC")).toHaveLength(2);
  });

  it("drops unsettled bars inside a batch too", async () => {
    stubResults([
      { ...bar("2026-08-14", 7700), symbol: "SPY" },
      { ...bar("2026-08-17", null), symbol: "SPY" },
    ]);
    const out = await fetchEquityHistoricalBatch(["SPY"]);
    expect(out.SPY.map((c) => c.date)).toEqual(["2026-08-14"]);
  });
});

describe("dividend yield normalization", () => {
  it("rescales the percent-valued yield the provider returns", async () => {
    stubResults([{ symbol: "VZ", dividend_yield: 6.05, payout_ratio: 0.7279 }]);
    const m = await fetchMetrics("VZ");
    expect(m.dividend_yield).toBeCloseTo(0.0605, 6);
  });

  it("leaves payout_ratio alone because it is already a decimal", async () => {
    stubResults([{ symbol: "VZ", dividend_yield: 6.05, payout_ratio: 0.7279 }]);
    const m = await fetchMetrics("VZ");
    expect(m.payout_ratio).toBe(0.7279);
  });

  it("applies to the profile endpoint too", async () => {
    stubResults([{ symbol: "KO", dividend_yield: 2.42 }]);
    const p = await fetchProfile("KO");
    expect(p.dividend_yield).toBeCloseTo(0.0242, 6);
  });

  it("passes through a missing yield untouched", async () => {
    stubResults([{ symbol: "NVDA" }]);
    const m = await fetchMetrics("NVDA");
    expect(m.dividend_yield).toBeUndefined();
  });

  it("accepts a bare object as well as a single-element array", async () => {
    stubResults({ symbol: "KO", dividend_yield: 2.42 });
    const m = await fetchMetrics("KO");
    expect(m.dividend_yield).toBeCloseTo(0.0242, 6);
  });
});

describe("fetchScreener", () => {
  it("asks OpenBB for the finviz provider with metric, signal and filters_dict", async () => {
    stubResults([{ symbol: "AAPL", price: 100 }]);
    await fetchScreener({
      metric: "overview",
      signal: "top_gainers",
      filters_dict: JSON.stringify({ Index: "S&P 500" }),
      limit: 50,
    });
    const u = lastUrl();
    expect(u.pathname).toBe("/api/v1/equity/screener");
    expect(u.searchParams.get("provider")).toBe("finviz");
    expect(u.searchParams.get("metric")).toBe("overview");
    expect(u.searchParams.get("signal")).toBe("top_gainers");
    expect(u.searchParams.get("limit")).toBe("50");
    expect(JSON.parse(JSON.parse(u.searchParams.get("filters_dict")!))).toEqual({ Index: "S&P 500" });
  });

  it("strips the duplicated first letter when the whole batch is bugged", async () => {
    stubResults([{ symbol: "NNVDA" }, { symbol: "MMSFT" }]);
    const rows = await fetchScreener({ metric: "overview", limit: 10 });
    expect(rows.map((r) => r.symbol)).toEqual(["NVDA", "MSFT"]);
  });
});

describe("fetchCompareGroups", () => {
  it("asks OpenBB finviz groups for the chosen slice", async () => {
    stubResults([{ name: "Technology", pe: 28 }]);
    await fetchCompareGroups("sector", "valuation");
    const u = lastUrl();
    expect(u.pathname).toBe("/api/v1/equity/compare/groups");
    expect(u.searchParams.get("provider")).toBe("finviz");
    expect(u.searchParams.get("group")).toBe("sector");
    expect(u.searchParams.get("metric")).toBe("valuation");
  });
});
