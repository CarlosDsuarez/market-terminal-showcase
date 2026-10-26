import { describe, expect, it } from "vitest";
import {
  alignByDate, annVol, betaAlpha, cagr, calmar, correlation, dailyReturns,
  datedReturns, hitRate, historicalVar95, maxDrawdown, returnsByDate, sharpe,
  sortino, stdev, summarize, totalReturn, yearsBetween, PERIODS_PER_YEAR,
} from "./perf";

describe("dailyReturns", () => {
  it("computes period-over-period change", () => {
    const r = dailyReturns([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.1, 10);
  });

  it("returns nothing for a single point", () => {
    expect(dailyReturns([100])).toEqual([]);
  });

  it("skips a non-positive base rather than dividing by it", () => {
    expect(dailyReturns([0, 100])).toEqual([]);
  });
});

describe("datedReturns", () => {
  const dates = ["d1", "d2", "d3", "d4", "d5"];

  it("stamps each return with the ending bar, skipping a non-positive base", () => {
    const r = datedReturns([100, 110, 0, 50, 55], dates);
    expect(r).toHaveLength(3);
    expect(r[0].date).toBe("d2");
    expect(r[0].ret).toBeCloseTo(0.1, 10);
    expect(r[1].date).toBe("d3");
    expect(r[1].ret).toBeCloseTo(-1, 10);
    // 50 → 55 is the last move; labelling it d4 would be the zip-by-index bug.
    expect(r[2].date).toBe("d5");
    expect(r[2].ret).toBeCloseTo(0.1, 10);
  });

  it("returns nothing for a single point", () => {
    expect(datedReturns([100], ["d1"])).toEqual([]);
  });
});

describe("alignByDate", () => {
  it("intersects on shared dates and drops the rest", () => {
    const a = new Map([["d1", 0.1], ["d2", 0.2], ["d3", 0.3]]);
    const b = new Map([["d2", 1], ["d3", 2], ["d4", 3]]);
    const aligned = alignByDate(a, b);
    expect(aligned.dates).toEqual(["d2", "d3"]);
    expect(aligned.a).toEqual([0.2, 0.3]);
    expect(aligned.b).toEqual([1, 2]);
  });
});

describe("returnsByDate", () => {
  it("stamps each return with the ending bar's date", () => {
    const m = returnsByDate([
      { date: "d1", close: 100 },
      { date: "d2", close: 110 },
      { date: "d3", close: 0 },
      { date: "d4", close: 50 },
      { date: "d5", close: 55 },
    ]);
    expect(m.get("d5")).toBeCloseTo(0.1, 10);
    expect(m.has("d4")).toBe(false);
  });
});

describe("totalReturn and cagr", () => {
  it("measures the whole period", () => {
    expect(totalReturn([100, 150])).toBeCloseTo(0.5, 10);
  });

  it("annualises growth over the given years", () => {
    // 21% over two years compounds to 10% a year.
    expect(cagr([100, 121], 2)).toBeCloseTo(0.1, 10);
  });

  it("declines to annualise a zero-length window", () => {
    expect(cagr([100, 121], 0)).toBeUndefined();
  });
});

describe("stdev and annVol", () => {
  it("uses the sample standard deviation", () => {
    // Deviations from a mean of 5 sum to 32; sample variance divides by n-1.
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it("needs at least two points", () => {
    expect(stdev([5])).toBeUndefined();
  });

  it("annualises by the square root of the trading year", () => {
    const rets = [0.01, -0.01, 0.02, -0.02];
    expect(annVol(rets)).toBeCloseTo(stdev(rets)! * Math.sqrt(PERIODS_PER_YEAR), 10);
  });
});

describe("sharpe and sortino", () => {
  it("scales mean excess return by volatility", () => {
    const rets = [0.01, -0.01, 0.02, -0.02, 0.03];
    const s = sharpe(rets);
    expect(s).toBeCloseTo(
      ((rets.reduce((a, b) => a + b, 0) / rets.length) / stdev(rets)!) * Math.sqrt(PERIODS_PER_YEAR),
      8
    );
  });

  it("has no value when there is no volatility to divide by", () => {
    expect(sharpe([0.01, 0.01, 0.01])).toBeUndefined();
  });

  it("has no downside deviation to divide by when nothing loses", () => {
    expect(sortino([0.01, 0.02, 0.03])).toBeUndefined();
  });

  it("penalises only the downside", () => {
    const mixed = [0.05, -0.01, 0.05, -0.01];
    expect(sortino(mixed)!).toBeGreaterThan(sharpe(mixed)!);
  });
});

describe("maxDrawdown", () => {
  it("finds the worst peak-to-trough decline and dates it", () => {
    const values = [100, 120, 60, 90];
    const dates = ["a", "b", "c", "d"];
    const dd = maxDrawdown(values, dates);
    expect(dd.maxDrawdown).toBeCloseTo(-0.5, 10);
    expect(dd.peakDate).toBe("b");
    expect(dd.troughDate).toBe("c");
  });

  it("reports zero for a series that only rises", () => {
    expect(maxDrawdown([100, 110, 120]).maxDrawdown).toBe(0);
  });

  it("emits an underwater value per point", () => {
    expect(maxDrawdown([100, 120, 60, 90]).series).toHaveLength(4);
  });

  it("feeds calmar", () => {
    expect(calmar(0.2, -0.4)).toBeCloseTo(0.5, 10);
    expect(calmar(0.2, 0)).toBeUndefined();
  });
});

describe("betaAlpha", () => {
  it("recovers a beta of one from an identical series", () => {
    const b = [0.01, -0.02, 0.03, -0.01, 0.02];
    const r = betaAlpha(b, b);
    expect(r.beta).toBeCloseTo(1, 10);
    expect(r.alpha).toBeCloseTo(0, 10);
    expect(r.rSquared).toBeCloseTo(1, 10);
  });

  it("recovers a beta of two from a doubled series", () => {
    const b = [0.01, -0.02, 0.03, -0.01, 0.02];
    expect(betaAlpha(b.map((x) => x * 2), b).beta).toBeCloseTo(2, 10);
  });

  it("reports alpha for a constant outperformance", () => {
    const b = [0.01, -0.02, 0.03, -0.01, 0.02];
    const r = betaAlpha(b.map((x) => x + 0.001), b);
    expect(r.beta).toBeCloseTo(1, 10);
    expect(r.alpha).toBeCloseTo(0.001 * PERIODS_PER_YEAR, 8);
  });

  it("gives up when the benchmark never moves", () => {
    expect(betaAlpha([0.01, 0.02], [0, 0]).beta).toBeUndefined();
  });
});

describe("correlation", () => {
  it("is 1 against itself and -1 against its negation", () => {
    const a = [0.01, -0.02, 0.03, -0.01];
    expect(correlation(a, a)).toBeCloseTo(1, 10);
    expect(correlation(a, a.map((x) => -x))).toBeCloseTo(-1, 10);
  });

  it("is undefined when one side is flat", () => {
    expect(correlation([0.01, 0.02], [0, 0])).toBeUndefined();
  });

  it("is 1 for identical closes when one series lists later", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2020-03-${String(i + 1).padStart(2, "0")}`);
    const closes = dates.map((_, i) => 100 + Math.sin(i) * 10 + i);
    const a = dates.map((date, i) => ({ date, close: closes[i] }));
    const b = a.slice(2);
    const aligned = alignByDate(returnsByDate(a), returnsByDate(b));
    expect(aligned.dates.length).toBeGreaterThanOrEqual(20);
    expect(correlation(aligned.a, aligned.b)).toBeCloseTo(1, 10);
    const aRets = dailyReturns(a.map((c) => c.close));
    const bRets = dailyReturns(b.map((c) => c.close));
    expect(correlation(aRets.slice(0, bRets.length), bRets)).not.toBeCloseTo(1, 5);
  });
});

describe("historicalVar95", () => {
  it("reports the empirical 5th percentile", () => {
    // Returns -0.50 .. 0.49 in 0.01 steps; the 5th percentile sits at index 5.
    const rets = Array.from({ length: 100 }, (_, i) => (i - 50) / 100);
    expect(historicalVar95(rets)).toBeCloseTo(-0.45, 10);
  });

  it("refuses to estimate a tail from too few observations", () => {
    expect(historicalVar95([0.01, -0.02])).toBeUndefined();
  });
});

describe("hitRate", () => {
  it("counts the share of positive periods", () => {
    expect(hitRate([0.1, -0.1, 0.1])).toBeCloseTo(2 / 3, 10);
  });
});

describe("yearsBetween", () => {
  it("measures a calendar year as about one", () => {
    expect(yearsBetween("2020-01-01", "2021-01-01")).toBeCloseTo(1, 2);
  });
});

describe("summarize", () => {
  const dates = Array.from({ length: 60 }, (_, i) =>
    `2020-0${Math.floor(i / 30) + 1}-${String((i % 30) + 1).padStart(2, "0")}`
  );
  const values = dates.map((_, i) => 100 * 1.001 ** i);

  it("fills the fields a real curve supports", () => {
    const s = summarize(values, dates);
    expect(s.totalReturn).toBeCloseTo(1.001 ** 59 - 1, 8);
    expect(s.cagr).toBeDefined();
    expect(s.annVol).toBeDefined();
    expect(s.maxDrawdown).toBe(0);
    expect(s.hitRate).toBe(1);
  });

  it("adds beta and alpha only when a benchmark is supplied", () => {
    expect(summarize(values, dates).beta).toBeUndefined();
    expect(summarize(values, dates, { values, dates }).beta).toBeCloseTo(1, 8);
  });

  it("survives a curve too short to say anything about", () => {
    const s = summarize([100], ["2020-01-01"]);
    expect(s.totalReturn).toBeUndefined();
    expect(s.sharpe).toBeUndefined();
  });

  it("dates best and worst days from the return's ending bar, not by index", () => {
    const s = summarize(
      [100, 110, 0, 50, 200],
      ["d1", "d2", "d3", "d4", "d5"],
    );
    expect(s.worstDate).toBe("d3");
    expect(s.bestDate).toBe("d5");
  });

  it("recovers beta k when the benchmark is truncated on the left", () => {
    const k = 1.5;
    const dates = Array.from({ length: 10 }, (_, i) => `2020-01-${String(i + 1).padStart(2, "0")}`);
    const benchRets = [0.011, -0.004, 0.021, -0.013, 0.006, 0.018, -0.009, 0.004, 0.002];
    const pricesFrom = (rets: number[]) => {
      const out = [100];
      for (const r of rets) out.push(out[out.length - 1] * (1 + r));
      return out;
    };
    const s = summarize(pricesFrom(benchRets.map((r) => r * k)), dates, {
      values: pricesFrom(benchRets).slice(2),
      dates: dates.slice(2),
    });
    expect(s.beta).toBeCloseTo(k, 5);
  });

  it("does not treat a one-day calendar shift as beta 1", () => {
    const dates = Array.from({ length: 8 }, (_, i) => `2020-01-${String(i + 1).padStart(2, "0")}`);
    const rets = [0.02, -0.01, 0.03, -0.02, 0.01, 0.04, -0.03];
    const pricesFrom = (rs: number[]) => {
      const out = [100];
      for (const r of rs) out.push(out[out.length - 1] * (1 + r));
      return out;
    };
    const prices = pricesFrom(rets);
    const s = summarize(prices, dates, {
      values: prices,
      dates: dates.map((d) => {
        const day = Number(d.slice(-2));
        return `2020-01-${String(day + 1).padStart(2, "0")}`;
      }),
    });
    expect(s.beta).not.toBeCloseTo(1, 2);
  });
});
