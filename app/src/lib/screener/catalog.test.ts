import { describe, expect, it } from "vitest";
import {
  FILTERS,
  SIGNALS,
  VIEW_COLUMNS,
  filterByKey,
  metricForColumn,
} from "./catalog";

describe("screener catalog", () => {
  it("exposes the screener signal list (ids accepted by the OpenBB finviz provider)", () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(ids).toContain("top_gainers");
    expect(ids).toContain("head_shoulders_inverse");
    expect(ids).toHaveLength(33);
  });

  it("groups filters into descriptive, fundamental and technical", () => {
    const cats = new Set(FILTERS.map((f) => f.category));
    expect(cats).toEqual(new Set(["descriptive", "fundamental", "technical"]));
    expect(filterByKey("Index")?.options).toContain("S&P 500");
    expect(filterByKey("P/E")?.options).toContain("Under 20");
    expect(filterByKey("RSI (14)")?.options).toContain("Oversold (30)");
  });

  it("maps each table view to OpenBB metric columns", () => {
    expect(VIEW_COLUMNS.overview.map((c) => c.id)).toContain("symbol");
    expect(VIEW_COLUMNS.valuation.map((c) => c.id)).toContain("peg_ratio");
    expect(VIEW_COLUMNS.financial.map((c) => c.id)).toContain("return_on_equity");
    expect(VIEW_COLUMNS.ownership.map((c) => c.id)).toContain("short_ratio");
    expect(VIEW_COLUMNS.performance.map((c) => c.id)).toContain("price_change_ytd");
    expect(VIEW_COLUMNS.technical.map((c) => c.id)).toContain("rsi");
  });

  it("knows which OpenBB metric populates a custom column", () => {
    expect(metricForColumn("peg_ratio")).toBe("valuation");
    expect(metricForColumn("rsi")).toBe("technical");
    expect(metricForColumn("name")).toBe("overview");
  });
});
