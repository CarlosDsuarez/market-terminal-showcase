import { describe, expect, it } from "vitest";
import { BUILTIN_PRESETS, sanitizeScreener } from "./screenerStore";

describe("sanitizeScreener", () => {
  it("keeps a well-formed preset list and page size", () => {
    const out = sanitizeScreener({
      pageSize: 50,
      fetchLimit: 500,
      customColumns: ["symbol", "rsi"],
      presets: [{ id: "p1", name: "Mine", signal: "oversold", filters: {}, view: "technical", customColumns: ["symbol"] }],
    });
    expect(out.pageSize).toBe(50);
    expect(out.fetchLimit).toBe(500);
    expect(out.customColumns).toEqual(["symbol", "rsi"]);
    expect(out.presets).toHaveLength(1);
    expect(out.presets[0].name).toBe("Mine");
  });

  it("falls back when junk is stored", () => {
    const out = sanitizeScreener({ pageSize: 7, fetchLimit: "nope", customColumns: "x", presets: null });
    expect(out.pageSize).toBe(20);
    expect(out.fetchLimit).toBe(250);
    expect(out.customColumns[0]).toBe("symbol");
    expect(out.presets).toEqual([]);
  });

  it("ships named factory screens", () => {
    const names = BUILTIN_PRESETS.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Value", "Oversold", "Unusual Volume", "Dividend", "Above SMA200"]));
  });
});
