import { describe, expect, it } from "vitest";
import type { Candle } from "./api";
import {
  adx, atr, bollinger, closes, donchian, ema, latest, macd, obv, prior,
  roc, rsi, sma, snapshot, stochastic, vwap, wma,
} from "./indicators";

/** Build candles from closes, with a fixed high/low band around each close. */
function bars(closeVals: number[], band = 1, volume = 100): Candle[] {
  return closeVals.map((c, i) => ({
    date: `2020-01-${String(i + 1).padStart(2, "0")}`,
    open: c, high: c + band, low: c - band, close: c, volume,
  }));
}

/** A deterministic 60-bar series with both trend and oscillation. */
const SYNTHETIC = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 4);

describe("sma", () => {
  it("averages the trailing window", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });

  it("leaves the warm-up window undefined", () => {
    const out = sma(SYNTHETIC, 20);
    expect(out.slice(0, 19).every((v) => v === undefined)).toBe(true);
    expect(out[19]).toBeDefined();
  });

  it("returns a value per input bar", () => {
    expect(sma(SYNTHETIC, 20)).toHaveLength(SYNTHETIC.length);
  });
});

describe("ema", () => {
  it("holds the level of a flat series", () => {
    const flat = new Array(30).fill(7);
    expect(latest(ema(flat, 10))).toBeCloseTo(7, 10);
  });

  it("seeds on the simple average, so it agrees with sma at the seed bar", () => {
    // Seeded at index 2 with sma = 2; a linear ramp then keeps the two equal.
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });

  it("leads the sma when the series is accelerating", () => {
    // On a straight ramp the two converge exactly (see the case above), so the
    // lead only shows on a convex series where recent bars rise fastest.
    const accelerating = Array.from({ length: 60 }, (_, i) => i * i);
    expect(latest(ema(accelerating, 20))!).toBeGreaterThan(latest(sma(accelerating, 20))!);
  });
});

describe("wma", () => {
  it("weights recent bars more heavily", () => {
    // (1*1 + 2*2 + 3*3) / (1+2+3) = 14/6
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6, 10);
  });
});

describe("rsi", () => {
  it("reads 100 when every bar is an up bar", () => {
    expect(latest(rsi([1, 2, 3, 4, 5, 6, 7, 8], 3))).toBe(100);
  });

  it("reads 0 when every bar is a down bar", () => {
    expect(latest(rsi([8, 7, 6, 5, 4, 3, 2, 1], 3))).toBe(0);
  });

  it("uses Wilder smoothing, not a simple average", () => {
    // Two up bars then one down bar, period 2. Wilder carries the smoothed
    // averages forward: avgGain 1 → 0.5, avgLoss 0 → 0.5, so RSI is exactly 50.
    expect(rsi([10, 11, 12, 11], 2)).toEqual([undefined, undefined, 100, 50]);
  });

  it("stays within 0-100 across the synthetic series", () => {
    for (const v of rsi(SYNTHETIC)) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("macd", () => {
  it("collapses to zero on a flat series", () => {
    const flat = new Array(60).fill(50);
    const m = macd(flat);
    expect(latest(m.macd)).toBeCloseTo(0, 10);
    expect(latest(m.signal)).toBeCloseTo(0, 10);
    expect(latest(m.histogram)).toBeCloseTo(0, 10);
  });

  it("goes positive when the fast average leads the slow one up", () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
    expect(latest(macd(rising).macd)!).toBeGreaterThan(0);
  });

  it("keeps histogram equal to macd minus signal", () => {
    const m = macd(SYNTHETIC);
    const i = m.histogram.length - 1;
    expect(m.histogram[i]).toBeCloseTo(m.macd[i]! - m.signal[i]!, 10);
  });
});

describe("bollinger", () => {
  it("collapses the bands onto the mean when there is no dispersion", () => {
    const flat = new Array(10).fill(10);
    const b = bollinger(flat, 3);
    expect(latest(b.upper)).toBe(10);
    expect(latest(b.lower)).toBe(10);
    expect(latest(b.bandwidth)).toBe(0);
    expect(latest(b.percentB)).toBe(50);
  });

  it("uses the population standard deviation", () => {
    // mean 5, population sd 2 over these eight values.
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(latest(b.mid)).toBeCloseTo(5, 10);
    expect(latest(b.upper)).toBeCloseTo(9, 10);
    expect(latest(b.lower)).toBeCloseTo(1, 10);
    expect(latest(b.percentB)).toBeCloseTo(100, 10);
  });
});

describe("atr", () => {
  it("settles on the true range when every bar has the same range", () => {
    // high/low band of 1 either side, close unchanged → true range is 2 every bar.
    const c = bars(new Array(20).fill(10), 1);
    expect(latest(atr(c, 5))).toBeCloseTo(2, 10);
  });

  it("counts a gap through the previous close", () => {
    const c = bars([10, 20], 1);
    // Bar 1: high 21, low 19, prev close 10 → true range is 21 - 10 = 11.
    expect(latest(atr(c, 2))).toBeCloseTo((2 + 11) / 2, 10);
  });
});

describe("stochastic", () => {
  it("reads 100 with the close at the top of its window", () => {
    const c = bars([1, 2, 3, 4, 5], 0);
    expect(latest(stochastic(c, 3, 1).k)).toBe(100);
  });

  it("reads 0 with the close at the bottom of its window", () => {
    const c = bars([5, 4, 3, 2, 1], 0);
    expect(latest(stochastic(c, 3, 1).k)).toBe(0);
  });

  it("calls a flat window neutral rather than dividing by zero", () => {
    const c = bars([3, 3, 3, 3], 0);
    expect(latest(stochastic(c, 3, 1).k)).toBe(50);
  });
});

describe("adx", () => {
  it("reports a pure uptrend as maximally directional", () => {
    const c = bars(Array.from({ length: 60 }, (_, i) => 100 + i), 1);
    const r = adx(c, 14);
    expect(latest(r.minusDI)).toBeCloseTo(0, 10);
    expect(latest(r.plusDI)!).toBeGreaterThan(0);
    expect(latest(r.adx)).toBeCloseTo(100, 6);
  });

  it("flips the directional indicators in a downtrend", () => {
    const c = bars(Array.from({ length: 60 }, (_, i) => 200 - i), 1);
    const r = adx(c, 14);
    expect(latest(r.plusDI)).toBeCloseTo(0, 10);
    expect(latest(r.minusDI)!).toBeGreaterThan(0);
  });
});

describe("donchian", () => {
  it("brackets the window's extremes", () => {
    const c = bars([10, 12, 11, 15, 13], 1);
    const d = donchian(c, 3);
    // Last three closes 11/15/13 → highs 12/16/14, lows 10/14/12.
    expect(latest(d.upper)).toBe(16);
    expect(latest(d.lower)).toBe(10);
    expect(latest(d.mid)).toBe(13);
  });
});

describe("obv", () => {
  it("adds volume on up bars and subtracts it on down bars", () => {
    const c: Candle[] = [10, 11, 10, 12].map((close, i) => ({
      date: `2020-01-0${i + 1}`, open: close, high: close, low: close, close,
      volume: (i + 1) * 100,
    }));
    expect(obv(c)).toEqual([0, 200, -100, 300]);
  });
});

describe("vwap", () => {
  it("equals the price when price and volume never change", () => {
    const c = bars(new Array(5).fill(10), 0, 500);
    expect(latest(vwap(c))).toBeCloseTo(10, 10);
  });
});

describe("roc", () => {
  it("measures percentage change over the lookback", () => {
    expect(roc([10, 11, 12], 2)[2]).toBeCloseTo(20, 10);
  });
});

describe("latest and prior", () => {
  it("skip over undefined slots", () => {
    expect(latest([undefined, 1, 2, 3])).toBe(3);
    expect(prior([undefined, 1, 2, 3])).toBe(2);
    expect(prior([undefined, 1, 2, 3], 2)).toBe(1);
  });

  it("return undefined when the series holds nothing", () => {
    expect(latest([undefined, undefined])).toBeUndefined();
    expect(prior([1])).toBeUndefined();
  });
});

describe("alignment", () => {
  const c = bars(SYNTHETIC);

  it("returns one value per bar from every indicator", () => {
    const n = c.length;
    expect(sma(closes(c), 10)).toHaveLength(n);
    expect(ema(closes(c), 10)).toHaveLength(n);
    expect(rsi(closes(c))).toHaveLength(n);
    expect(macd(closes(c)).macd).toHaveLength(n);
    expect(bollinger(closes(c)).upper).toHaveLength(n);
    expect(atr(c)).toHaveLength(n);
    expect(stochastic(c).k).toHaveLength(n);
    expect(adx(c).adx).toHaveLength(n);
    expect(donchian(c).upper).toHaveLength(n);
    expect(obv(c)).toHaveLength(n);
  });

  it("never emits a value before its warm-up has elapsed", () => {
    expect(sma(closes(c), 10).slice(0, 9).every((v) => v === undefined)).toBe(true);
    expect(rsi(closes(c), 14).slice(0, 14).every((v) => v === undefined)).toBe(true);
    expect(bollinger(closes(c), 20).upper.slice(0, 19).every((v) => v === undefined)).toBe(true);
  });
});

describe("snapshot", () => {
  it("fills the fields a 60-bar history can support", () => {
    const s = snapshot(bars(SYNTHETIC));
    expect(s.price).toBeDefined();
    expect(s.sma20).toBeDefined();
    expect(s.sma50).toBeDefined();
    expect(s.rsi14).toBeDefined();
    expect(s.macd).toBeDefined();
    expect(s.bbUpper).toBeDefined();
    expect(s.atr14).toBeDefined();
    expect(s.adx14).toBeDefined();
    expect(s.obv).toBeDefined();
  });

  it("leaves long-window fields undefined rather than guessing", () => {
    const s = snapshot(bars(SYNTHETIC));
    // 60 bars cannot support a 200-day average or a 252-day channel.
    expect(s.sma200).toBeUndefined();
    expect(s.donchianUpper).toBeUndefined();
  });

  it("survives an empty history", () => {
    const s = snapshot([]);
    expect(s.price).toBeUndefined();
    expect(s.rsi14).toBeUndefined();
  });

  it("defines a 252-day Donchian on a 280-bar window", () => {
    const start = new Date(2019, 0, 1);
    const long = Array.from({ length: 280 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const c = 100 + i * 0.1;
      return { date: iso, open: c, high: c + 1, low: c - 1, close: c, volume: 100 };
    });
    const s = snapshot(long);
    expect(s.donchianUpper).toBeDefined();
    expect(s.donchianLower).toBeDefined();
  });
});
