import { describe, expect, it } from "vitest";
import {
  sig52w,
  sigADX,
  sigAnalystRec,
  sigAnalystUpside,
  sigBollinger,
  sigCross,
  sigDebtEquity,
  sigDividend,
  sigEvEbitda,
  sigGrowth,
  sigMA,
  sigMACD,
  sigMargin,
  sigOBV,
  sigPE,
  sigRSI,
  sigVolatility,
  tally,
} from "./signals";

describe("sigDividend", () => {
  // The API layer rescales yfinance's percent-valued dividendYield, so these
  // classifiers receive decimals: Verizon's 6.05% arrives as 0.0605.
  it("reads a decimal yield as a percentage", () => {
    expect(sigDividend(0.0605, 0.7279).detail).toContain("6.05% yield");
    expect(sigDividend(0.0035, 0.1204).detail).toContain("0.35% yield");
  });

  it("rewards a comfortable payout and flags a stretched one", () => {
    expect(sigDividend(0.0035, 0.1204).level).toBe("bull");
    expect(sigDividend(0.0605, 0.7279).level).toBe("neutral");
    expect(sigDividend(0.0509, 2.65).level).toBe("bear");
  });

  it("treats a missing or zero yield as no dividend", () => {
    expect(sigDividend(undefined).label).toBe("No dividend");
    expect(sigDividend(0).label).toBe("No dividend");
  });
});

describe("sigMA", () => {
  it("classifies distance from the moving average", () => {
    expect(sigMA(110, 100).level).toBe("bull");
    expect(sigMA(90, 100).level).toBe("bear");
    expect(sigMA(101, 100).level).toBe("neutral");
  });

  it("reports the gap as a signed percentage", () => {
    expect(sigMA(110, 100).detail).toBe("+10.0%");
    expect(sigMA(90, 100).detail).toBe("-10.0%");
  });

  it("degrades to n/a without inputs", () => {
    expect(sigMA(undefined, 100).level).toBe("na");
    expect(sigMA(110, undefined).level).toBe("na");
  });
});

describe("sig52w", () => {
  it("places the price within its 52-week range", () => {
    expect(sig52w(99, 100, 50).label).toBe("At 52w high");
    expect(sig52w(90, 100, 50).label).toBe("Upper range");
    expect(sig52w(75, 100, 50).label).toBe("Mid range");
    expect(sig52w(55, 100, 50).label).toBe("Lower range");
  });
});

describe("valuation classifiers", () => {
  it("bands the trailing P/E", () => {
    expect(sigPE(-5).level).toBe("bear");
    expect(sigPE(10).level).toBe("bull");
    expect(sigPE(18).level).toBe("neutral");
    expect(sigPE(50).level).toBe("bear");
    expect(sigPE(undefined).level).toBe("na");
  });

  it("bands EV/EBITDA", () => {
    expect(sigEvEbitda(8).level).toBe("bull");
    expect(sigEvEbitda(14).level).toBe("neutral");
    expect(sigEvEbitda(25).level).toBe("bear");
  });
});

describe("fundamental classifiers", () => {
  it("bands growth rates given as decimals", () => {
    expect(sigGrowth(0.164).level).toBe("bull");
    expect(sigGrowth(0.02).level).toBe("neutral");
    expect(sigGrowth(-0.2).level).toBe("bear");
    expect(sigGrowth(0.164).detail).toBe("+16.4% YoY");
  });

  it("bands margins by kind", () => {
    expect(sigMargin(0.4867, "gross").level).toBe("bull");
    expect(sigMargin(0.1, "op").level).toBe("neutral");
    expect(sigMargin(-0.05, "net").level).toBe("bear");
  });

  it("bands leverage", () => {
    expect(sigDebtEquity(0.3).level).toBe("bull");
    expect(sigDebtEquity(1).level).toBe("neutral");
    expect(sigDebtEquity(4).level).toBe("bear");
  });
});

describe("analyst classifiers", () => {
  it("measures upside to the consensus target", () => {
    expect(sigAnalystUpside(100, 120).level).toBe("bull");
    expect(sigAnalystUpside(100, 105).level).toBe("neutral");
    expect(sigAnalystUpside(100, 90).level).toBe("bear");
    expect(sigAnalystUpside(100, 120).detail).toBe("+20.0% to target");
  });

  it("maps the recommendation score", () => {
    expect(sigAnalystRec("strong_buy", 1.5).level).toBe("bull");
    expect(sigAnalystRec("hold", 3).level).toBe("neutral");
    expect(sigAnalystRec("underperform", 4.2).level).toBe("bear");
    expect(sigAnalystRec(undefined).level).toBe("na");
  });
});

describe("technical classifiers", () => {
  it("reads an oversold RSI as the bullish side of the trade", () => {
    expect(sigRSI(25).level).toBe("bull");
    expect(sigRSI(50).level).toBe("neutral");
    expect(sigRSI(80).level).toBe("bear");
    expect(sigRSI(undefined).level).toBe("na");
  });

  it("prefers a fresh MACD cross over a standing position", () => {
    // Was below, now above → cross.
    expect(sigMACD(1, 0.5, 0.2, 0.6).label).toBe("MACD bullish cross");
    expect(sigMACD(0.5, 1, 0.6, 0.2).label).toBe("MACD bearish cross");
    // Already above on the previous bar → the weaker "above signal" read.
    expect(sigMACD(1, 0.5, 0.9, 0.4).label).toBe("MACD above signal");
  });

  it("treats a band excursion as mean reversion", () => {
    expect(sigBollinger(110).level).toBe("bear");
    expect(sigBollinger(-5).level).toBe("bull");
    expect(sigBollinger(50).level).toBe("neutral");
  });

  it("refuses to read direction from a non-trending ADX", () => {
    expect(sigADX(12, 30, 10).label).toBe("No trend");
    expect(sigADX(30, 30, 10).level).toBe("bull");
    expect(sigADX(45, 10, 30).label).toBe("Strong downtrend");
  });

  it("names the golden and death crosses", () => {
    expect(sigCross(105, 100, 99, 100).label).toBe("Golden cross");
    expect(sigCross(95, 100, 101, 100).label).toBe("Death cross");
    expect(sigCross(105, 100, 104, 100).label).toBe("50d above 200d");
  });

  it("never calls volatility bullish", () => {
    expect(sigVolatility(1, 100).level).toBe("neutral");
    expect(sigVolatility(4, 100).level).toBe("bear");
    expect(sigVolatility(6, 100).level).toBe("bear");
    expect(sigVolatility(undefined, 100).level).toBe("na");
  });

  it("reads OBV direction as confirmation or divergence", () => {
    expect(sigOBV(200, 100).level).toBe("bull");
    expect(sigOBV(100, 200).level).toBe("bear");
    expect(sigOBV(100, 100).level).toBe("neutral");
  });
});

describe("tally", () => {
  const bull = { level: "bull" as const, label: "b" };
  const bear = { level: "bear" as const, label: "r" };
  const neutral = { level: "neutral" as const, label: "n" };
  const na = { level: "na" as const, label: "x" };

  it("counts each level", () => {
    const t = tally([bull, bull, bear, neutral, na]);
    expect(t).toMatchObject({ bull: 2, bear: 1, neutral: 1, na: 1, net: 1 });
  });

  it("calls a lopsided book bullish or bearish", () => {
    expect(tally([bull, bull, bull, bull, neutral]).verdict).toBe("Bullish");
    expect(tally([bear, bear, bear, bear, neutral]).verdict).toBe("Bearish");
  });

  it("calls a balanced book mixed", () => {
    expect(tally([bull, bull, bear, bear, neutral]).verdict).toBe("Mixed");
  });

  it("refuses to judge when too little is known", () => {
    expect(tally([bull, na, na, na]).verdict).toBe("Sparse");
  });
});
