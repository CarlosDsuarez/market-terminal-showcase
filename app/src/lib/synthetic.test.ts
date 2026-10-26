import { describe, expect, it } from "vitest";
import { SyntheticNotAvailable, UNIVERSE, syntheticGet } from "./synthetic";

type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };

describe("synthetic data generator", () => {
  it("is deterministic per symbol", () => {
    const a = syntheticGet("/equity/price/historical", { symbol: "ALFA", start_date: "2020-01-01", end_date: "2020-03-31" });
    const b = syntheticGet("/equity/price/historical", { symbol: "ALFA", start_date: "2020-01-01", end_date: "2020-03-31" });
    expect(a).toEqual(b);
  });

  it("produces well-formed daily bars inside the requested window", () => {
    const bars = syntheticGet("/equity/price/historical", { symbol: "BRVO", start_date: "2021-06-01", end_date: "2021-06-30" }) as Bar[];
    expect(bars.length).toBeGreaterThan(15);
    for (const c of bars) {
      expect(c.date >= "2021-06-01" && c.date <= "2021-06-30").toBe(true);
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.close).toBeGreaterThan(0);
    }
  });

  it("tags rows by symbol for batch requests", () => {
    const rows = syntheticGet("/equity/price/historical", { symbol: "ALFA,BRVO", start_date: "2022-01-03", end_date: "2022-01-07" }) as (Bar & { symbol: string })[];
    expect(new Set(rows.map((r) => r.symbol))).toEqual(new Set(["ALFA", "BRVO"]));
  });

  it("quotes as of the simulation date", () => {
    const q = syntheticGet("/equity/price/quote", { symbol: "ALFA", end_date: "2019-05-15" }) as { last_price: number };
    const bars = syntheticGet("/equity/price/historical", { symbol: "ALFA", start_date: "2019-05-01", end_date: "2019-05-15" }) as Bar[];
    expect(q.last_price).toBe(bars[bars.length - 1].close);
  });

  it("serves the screener from the fictional universe", () => {
    const rows = syntheticGet("/equity/screener", { signal: "top_gainers", limit: "10" }) as { symbol: string; change_percent: number }[];
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => (UNIVERSE as readonly string[]).includes(r.symbol))).toBe(true);
    expect(rows[0].change_percent).toBeGreaterThanOrEqual(rows[9].change_percent);
  });

  it("rejects endpoints it does not simulate", () => {
    expect(() => syntheticGet("/economy/calendar", {})).toThrow(SyntheticNotAvailable);
  });
});
