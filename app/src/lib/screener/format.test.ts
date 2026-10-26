import { describe, expect, it } from "vitest";
import { VIEW_COLUMNS } from "./catalog";
import { formatCell, rowsToCsv } from "./format";

describe("screener format", () => {
  it("turns signed change into up/down cells", () => {
    const col = VIEW_COLUMNS.overview.find((c) => c.id === "change_percent")!;
    expect(formatCell(col, { "Change %": 0.012 }).dir).toBe("up");
    expect(formatCell(col, { "Change %": -0.04 }).dir).toBe("down");
  });

  it("exports visible columns as CSV", () => {
    const cols = VIEW_COLUMNS.overview.filter((c) => c.id === "symbol" || c.id === "name");
    const csv = rowsToCsv([{ symbol: "AAPL", name: "Apple, Inc." }], cols);
    expect(csv).toBe('Ticker,Company\nAAPL,"Apple, Inc."');
  });
});
