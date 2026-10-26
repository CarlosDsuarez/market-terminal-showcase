import { describe, expect, it } from "vitest";
import {
  applyCustomFilters,
  buildScreenerRequest,
  coveringPreset,
  normalizeScreenerSymbols,
} from "./query";

describe("coveringPreset", () => {
  it("maps a custom P/E ceiling onto the next Under bucket", () => {
    expect(coveringPreset("P/E", { max: 18 })).toBe("Under 20");
  });

  it("maps a custom P/E floor onto the next Over bucket", () => {
    expect(coveringPreset("P/E", { min: 12 })).toBe("Over 10");
  });

  it("prefers a closed range option when both ends are set", () => {
    expect(coveringPreset("Price", { min: 1, max: 5 })).toBe("$1 to $5");
  });

  it("returns undefined when the filter has no numeric buckets", () => {
    expect(coveringPreset("Sector", { min: 1 })).toBeUndefined();
  });
});

describe("buildScreenerRequest", () => {
  it("omits Any and empty filters from filters_dict", () => {
    const req = buildScreenerRequest({
      metric: "overview",
      signal: null,
      filters: {
        Index: { kind: "preset", option: "S&P 500" },
        Sector: { kind: "preset", option: "Any" },
        "P/E": { kind: "preset", option: "Under 20" },
      },
      limit: 100,
    });
    expect(req.signal).toBeUndefined();
    expect(JSON.parse(req.filters_dict!)).toEqual({
      Index: "S&P 500",
      "P/E": "Under 20",
    });
    expect(req.limit).toBe(100);
    expect(req.metric).toBe("overview");
  });

  it("defaults to top_gainers when the screen would otherwise be empty", () => {
    const req = buildScreenerRequest({
      metric: "overview",
      signal: null,
      filters: {},
      limit: 50,
    });
    expect(req.signal).toBe("top_gainers");
    expect(req.filters_dict).toBeUndefined();
  });

  it("turns a custom range into a covering Finviz bucket", () => {
    const req = buildScreenerRequest({
      metric: "overview",
      signal: null,
      filters: {
        "P/E": { kind: "custom", min: 8, max: 18 },
      },
      limit: 50,
    });
    expect(JSON.parse(req.filters_dict!)).toEqual({ "P/E": "Under 20" });
  });

  it("passes an explicit signal through", () => {
    const req = buildScreenerRequest({
      metric: "technical",
      signal: "oversold",
      filters: {},
      limit: 50,
    });
    expect(req.signal).toBe("oversold");
  });
});

describe("applyCustomFilters", () => {
  const rows = [
    { symbol: "AAA", price_to_earnings: 9, price: 12 },
    { symbol: "BBB", price_to_earnings: 19, price: 12 },
    { symbol: "CCC", price_to_earnings: 7, price: 12 },
  ];

  it("keeps only rows inside the custom P/E window", () => {
    const out = applyCustomFilters(rows, {
      "P/E": { kind: "custom", min: 8, max: 18 },
    });
    expect(out.map((r) => r.symbol)).toEqual(["AAA"]);
  });

  it("drops a row that is missing the filtered field", () => {
    const out = applyCustomFilters(
      [{ symbol: "X" }, { symbol: "Y", price_to_earnings: 10 }],
      { "P/E": { kind: "custom", max: 15 } },
    );
    expect(out.map((r) => r.symbol)).toEqual(["Y"]);
  });

  it("leaves preset-only screens untouched", () => {
    expect(applyCustomFilters(rows, { "P/E": { kind: "preset", option: "Under 20" } })).toEqual(rows);
  });
});

describe("normalizeScreenerSymbols", () => {
  it("strips the duplicated first letter Finvizfinance prepends", () => {
    const out = normalizeScreenerSymbols([
      { symbol: "NNVDA", name: "NVIDIA" },
      { symbol: "MMSFT", name: "Microsoft" },
      { symbol: "BBF-B", name: "Brown-Forman" },
    ]);
    expect(out.map((r) => r.symbol)).toEqual(["NVDA", "MSFT", "BF-B"]);
  });

  it("leaves a healthy result set alone so AAPL is not truncated to APL", () => {
    const out = normalizeScreenerSymbols([
      { symbol: "AAPL" },
      { symbol: "MSFT" },
      { symbol: "NVDA" },
    ]);
    expect(out.map((r) => r.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });
});
