// Technical indicators. Pure functions over price series — no React, no network.
//
// Every function returns an array the same length as its input, with `undefined`
// in the warm-up window. Keeping the alignment means index `i` of any result
// always describes `candles[i]`, so a screen can zip indicators against bars
// without tracking per-indicator offsets.

import type { Candle } from "./api";

/** A value per bar. `undefined` means "not enough history yet at this bar". */
export type Series = (number | undefined)[];

const filled = (n: number): Series => new Array<number | undefined>(n).fill(undefined);

/** Index of the first usable value, or -1 when the series is entirely empty. */
function firstDefined(values: Series): number {
  for (let i = 0; i < values.length; i++) if (values[i] != null) return i;
  return -1;
}

/** The most recent defined value, which is what a readout panel wants. */
export function latest(series: Series): number | undefined {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return undefined;
}

/** The defined value `n` bars before the end — used to detect fresh crossovers. */
export function prior(series: Series, n = 1): number | undefined {
  let seen = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] == null) continue;
    if (seen === n) return series[i];
    seen++;
  }
  return undefined;
}

export const closes = (candles: Candle[]): Series => candles.map((c) => c.close);

// ────── Moving averages ──────

export function sma(values: Series, period: number): Series {
  const out = filled(values.length);
  if (period < 1) return out;
  const start = firstDefined(values);
  if (start < 0) return out;

  let sum = 0;
  let count = 0;
  for (let i = start; i < values.length; i++) {
    const v = values[i];
    // A hole after the warm-up would corrupt the running sum, so restart there.
    if (v == null) { sum = 0; count = 0; continue; }
    sum += v;
    count++;
    if (count > period) { sum -= values[i - period] as number; count = period; }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: Series, period: number): Series {
  const out = filled(values.length);
  if (period < 1) return out;
  const seeded = sma(values, period);
  const start = firstDefined(seeded);
  if (start < 0) return out;

  const k = 2 / (period + 1);
  // Seeding with the SMA rather than the first close keeps the early values from
  // being dominated by a single bar.
  let prev = seeded[start] as number;
  out[start] = prev;
  for (let i = start + 1; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wma(values: Series, period: number): Series {
  const out = filled(values.length);
  if (period < 1) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = values[i - period + 1 + j];
      if (v == null) { ok = false; break; }
      sum += v * (j + 1);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

/**
 * Wilder's smoothing: an EMA with k = 1/period, seeded on the simple mean.
 * RSI, ATR and ADX are all defined in terms of it, and using a plain EMA
 * instead produces values that visibly disagree with every charting package.
 */
function wilder(values: Series, period: number): Series {
  const out = filled(values.length);
  const start = firstDefined(values);
  if (start < 0 || start + period > values.length) return out;

  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = (prev * (period - 1) + (values[i] ?? 0)) / period;
    out[i] = prev;
  }
  return out;
}

// ────── Oscillators ──────

export function rsi(values: Series, period = 14): Series {
  const out = filled(values.length);
  if (values.length < period + 1) return out;

  const gains = filled(values.length);
  const losses = filled(values.length);
  for (let i = 1; i < values.length; i++) {
    const cur = values[i];
    const prev = values[i - 1];
    if (cur == null || prev == null) continue;
    const diff = cur - prev;
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }

  const avgGain = wilder(gains, period);
  const avgLoss = wilder(losses, period);
  for (let i = 0; i < values.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    // An unbroken run of up bars leaves no losses to divide by; RSI is 100 there.
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export interface MacdResult { macd: Series; signal: Series; histogram: Series; }

export function macd(values: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = filled(values.length);
  for (let i = 0; i < values.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f == null || s == null) continue;
    line[i] = f - s;
  }
  const signal = ema(line, signalPeriod);
  const histogram = filled(values.length);
  for (let i = 0; i < values.length; i++) {
    const m = line[i];
    const s = signal[i];
    if (m == null || s == null) continue;
    histogram[i] = m - s;
  }
  return { macd: line, signal, histogram };
}

export interface StochasticResult { k: Series; d: Series; }

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): StochasticResult {
  const k = filled(candles.length);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    // A flat window has no range to place the close within; 50 is the neutral read.
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  return { k, d: sma(k, dPeriod) };
}

export function roc(values: Series, period = 12): Series {
  const out = filled(values.length);
  for (let i = period; i < values.length; i++) {
    const cur = values[i];
    const past = values[i - period];
    if (cur == null || past == null || past === 0) continue;
    out[i] = ((cur - past) / past) * 100;
  }
  return out;
}

// ────── Volatility ──────

export interface BollingerResult {
  upper: Series; mid: Series; lower: Series;
  bandwidth: Series; percentB: Series;
}

export function bollinger(values: Series, period = 20, mult = 2): BollingerResult {
  const mid = sma(values, period);
  const upper = filled(values.length);
  const lower = filled(values.length);
  const bandwidth = filled(values.length);
  const percentB = filled(values.length);

  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    const price = values[i];
    if (m == null || price == null) continue;
    let variance = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) { ok = false; break; }
      variance += (v - m) ** 2;
    }
    if (!ok) continue;
    // Population standard deviation — the convention Bollinger bands are drawn with.
    const sd = Math.sqrt(variance / period);
    const up = m + mult * sd;
    const lo = m - mult * sd;
    upper[i] = up;
    lower[i] = lo;
    bandwidth[i] = m === 0 ? undefined : ((up - lo) / m) * 100;
    percentB[i] = up === lo ? 50 : ((price - lo) / (up - lo)) * 100;
  }
  return { upper, mid, lower, bandwidth, percentB };
}

/** True range per bar. The first bar has no previous close, so it is just high-low. */
function trueRange(candles: Candle[]): Series {
  const out = filled(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) { out[i] = c.high - c.low; continue; }
    const pc = candles[i - 1].close;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  return out;
}

export function atr(candles: Candle[], period = 14): Series {
  return wilder(trueRange(candles), period);
}

// ────── Trend ──────

export interface AdxResult { adx: Series; plusDI: Series; minusDI: Series; }

export function adx(candles: Candle[], period = 14): AdxResult {
  const n = candles.length;
  const plusDM = filled(n);
  const minusDM = filled(n);
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    // Only the larger of the two directional moves counts, and only if positive.
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  // Drop bar 0 from the TR series so all three smoothings share a start index:
  // +DM/-DM are only defined from bar 1, and +DI = smoothed(+DM) / smoothed(TR)
  // is wrong if the numerator and denominator cover different windows.
  const tr = trueRange(candles);
  const trFromOne: Series = tr.map((v, i) => (i === 0 ? undefined : v));

  const smoothTR = wilder(trFromOne, period);
  const smoothPlus = wilder(plusDM, period);
  const smoothMinus = wilder(minusDM, period);

  const plusDI = filled(n);
  const minusDI = filled(n);
  const dx = filled(n);
  for (let i = 0; i < n; i++) {
    const t = smoothTR[i];
    const p = smoothPlus[i];
    const m = smoothMinus[i];
    if (t == null || p == null || m == null || t === 0) continue;
    const pdi = (p / t) * 100;
    const mdi = (m / t) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100;
  }

  return { adx: wilder(dx, period), plusDI, minusDI };
}

export interface DonchianResult { upper: Series; mid: Series; lower: Series; }

export function donchian(candles: Candle[], period = 20): DonchianResult {
  const upper = filled(candles.length);
  const mid = filled(candles.length);
  const lower = filled(candles.length);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper[i] = hi;
    lower[i] = lo;
    mid[i] = (hi + lo) / 2;
  }
  return { upper, mid, lower };
}

// ────── Volume ──────

export function obv(candles: Candle[]): Series {
  const out = filled(candles.length);
  if (candles.length === 0) return out;
  let running = 0;
  out[0] = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) running += candles[i].volume;
    else if (diff < 0) running -= candles[i].volume;
    out[i] = running;
  }
  return out;
}

/** Session-agnostic VWAP: cumulative over the whole series, typical price weighted. */
export function vwap(candles: Candle[]): Series {
  const out = filled(candles.length);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    if (vol > 0) out[i] = pv / vol;
  }
  return out;
}

// ────── Summary ──────

/** Everything the TECH screen and the INTEL technical group read, computed once. */
export interface IndicatorSnapshot {
  price?: number;
  sma20?: number; sma50?: number; sma200?: number; ema21?: number;
  prevSma50?: number; prevSma200?: number;
  rsi14?: number;
  macd?: number; macdSignal?: number; macdHist?: number;
  prevMacd?: number; prevMacdSignal?: number;
  bbUpper?: number; bbMid?: number; bbLower?: number; bbWidth?: number; percentB?: number;
  atr14?: number;
  stochK?: number; stochD?: number;
  adx14?: number; plusDI?: number; minusDI?: number;
  donchianUpper?: number; donchianLower?: number;
  obv?: number; prevObv?: number;
  roc20?: number;
}

export function snapshot(candles: Candle[]): IndicatorSnapshot {
  const c = closes(candles);
  const s50 = sma(c, 50);
  const s200 = sma(c, 200);
  const m = macd(c);
  const bb = bollinger(c);
  const st = stochastic(candles);
  const dmi = adx(candles);
  const dc = donchian(candles, 252);
  const o = obv(candles);

  return {
    price: latest(c),
    sma20: latest(sma(c, 20)),
    sma50: latest(s50),
    sma200: latest(s200),
    ema21: latest(ema(c, 21)),
    prevSma50: prior(s50),
    prevSma200: prior(s200),
    rsi14: latest(rsi(c)),
    macd: latest(m.macd),
    macdSignal: latest(m.signal),
    macdHist: latest(m.histogram),
    prevMacd: prior(m.macd),
    prevMacdSignal: prior(m.signal),
    bbUpper: latest(bb.upper),
    bbMid: latest(bb.mid),
    bbLower: latest(bb.lower),
    bbWidth: latest(bb.bandwidth),
    percentB: latest(bb.percentB),
    atr14: latest(atr(candles)),
    stochK: latest(st.k),
    stochD: latest(st.d),
    adx14: latest(dmi.adx),
    plusDI: latest(dmi.plusDI),
    minusDI: latest(dmi.minusDI),
    donchianUpper: latest(dc.upper),
    donchianLower: latest(dc.lower),
    obv: latest(o),
    prevObv: prior(o),
    roc20: latest(roc(c, 20)),
  };
}
