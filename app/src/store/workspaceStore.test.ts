import { describe, expect, it } from "vitest";
import { HOME_TAB, sanitizeWorkspace } from "./workspaceStore";

describe("sanitizeWorkspace", () => {
  it("keeps tabs whose function still exists", () => {
    const { tabs } = sanitizeWorkspace({
      tabs: [
        { id: "CC:_", code: "CC" },
        { id: "DES:AAPL", code: "DES", symbol: "AAPL" },
      ],
      activeTabId: "DES:AAPL",
      activeSymbol: "AAPL",
    });
    expect(tabs).toEqual([
      { id: "CC:_", code: "CC", symbol: undefined },
      { id: "DES:AAPL", code: "DES", symbol: "AAPL" },
    ]);
  });

  // A retired function code used to crash FunctionPanel on every single load.
  it("drops a tab whose function code no longer exists", () => {
    const { tabs } = sanitizeWorkspace({
      tabs: [
        { id: "CC:_", code: "CC" },
        { id: "SCREENER:_", code: "SCREENER" },
      ],
      activeTabId: "CC:_",
    });
    expect(tabs.map((t) => t.code)).toEqual(["CC"]);
  });

  it("falls back to the home tab when every tab is unusable", () => {
    expect(sanitizeWorkspace({ tabs: [{ code: "GONE" }] }).tabs).toEqual([HOME_TAB]);
    expect(sanitizeWorkspace({ tabs: [] }).tabs).toEqual([HOME_TAB]);
  });

  it("repairs an activeTabId that points at a dropped tab", () => {
    const { activeTabId } = sanitizeWorkspace({
      tabs: [{ id: "CC:_", code: "CC" }, { id: "GONE:_", code: "GONE" }],
      activeTabId: "GONE:_",
    });
    expect(activeTabId).toBe("CC:_");
  });

  it("survives arbitrary junk in place of state", () => {
    for (const junk of [null, undefined, 42, "nope", [], { tabs: "not-an-array" }]) {
      const out = sanitizeWorkspace(junk);
      expect(out.tabs).toEqual([HOME_TAB]);
      expect(out.activeTabId).toBe(HOME_TAB.id);
      expect(out.activeSymbol).toBe("AAPL");
    }
  });

  it("discards malformed tab entries without discarding the good ones", () => {
    const { tabs } = sanitizeWorkspace({
      tabs: [null, "CC", { code: "DES", symbol: 7 }, { id: "CC:_", code: "CC" }],
    });
    expect(tabs).toEqual([{ id: "CC:_", code: "CC", symbol: undefined }]);
  });

  it("collapses duplicate tab ids", () => {
    const { tabs } = sanitizeWorkspace({
      tabs: [{ id: "CC:_", code: "CC" }, { id: "CC:_", code: "CC" }],
    });
    expect(tabs).toHaveLength(1);
  });

  it("derives a missing id from the code and symbol", () => {
    const { tabs } = sanitizeWorkspace({ tabs: [{ code: "DES", symbol: "msft" }] });
    expect(tabs[0]).toEqual({ id: "DES:MSFT", code: "DES", symbol: "MSFT" });
  });

  it("normalizes the active symbol and defaults it when blank", () => {
    expect(sanitizeWorkspace({ activeSymbol: "tsla" }).activeSymbol).toBe("TSLA");
    expect(sanitizeWorkspace({ activeSymbol: "   " }).activeSymbol).toBe("AAPL");
    expect(sanitizeWorkspace({ activeSymbol: 123 }).activeSymbol).toBe("AAPL");
  });
});
