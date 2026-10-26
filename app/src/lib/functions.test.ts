import { describe, expect, it } from "vitest";
import { parseCommand } from "./functions";

describe("parseCommand — ALGO", () => {
  it("opens ALGO with or without a symbol", () => {
    expect(parseCommand("ALGO", null)).toEqual({ code: "ALGO" });
    expect(parseCommand("AAPL ALGO", "MSFT")).toEqual({ symbol: "AAPL", code: "ALGO" });
    expect(parseCommand("ALGO TSLA", null)).toEqual({ code: "ALGO" });
  });
});

describe("parseCommand — SCR", () => {
  it("opens SCR from SCR or the EQS alias", () => {
    expect(parseCommand("SCR", null)).toEqual({ code: "SCR" });
    expect(parseCommand("EQS", null)).toEqual({ code: "SCR" });
    expect(parseCommand("EQS NVDA", null)).toEqual({ code: "SCR" });
  });
});

describe("parseCommand — multi-symbol", () => {
  it("keeps a comma-joined list before the code", () => {
    expect(parseCommand("AAPL,MSFT,NVDA COMP", null)).toEqual({
      symbol: "AAPL,MSFT,NVDA",
      code: "COMP",
    });
  });

  it("keeps space-separated symbols before the code", () => {
    expect(parseCommand("AAPL MSFT COMP", null)).toEqual({
      symbol: "AAPL,MSFT",
      code: "COMP",
    });
  });

  it("accepts code-first order too", () => {
    expect(parseCommand("COMP AAPL,MSFT", null)).toEqual({
      symbol: "AAPL,MSFT",
      code: "COMP",
    });
  });

  it("falls back to the active symbol for a bare needsSymbol code", () => {
    expect(parseCommand("DES", "AAPL")).toEqual({ symbol: "AAPL", code: "DES" });
    expect(parseCommand("DES", null)).toBeNull();
  });
});
