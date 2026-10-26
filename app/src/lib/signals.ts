// Rule-based signal classifiers. These are heuristics, not predictions.
// Each check returns a level (bull/bear/neutral/na) and a one-line interpretation.

export type SignalLevel = "bull" | "bear" | "neutral" | "na";

export interface Signal {
  level: SignalLevel;
  label: string;
  detail?: string;
}

const bull = (label: string, detail?: string): Signal => ({ level: "bull", label, detail });
const bear = (label: string, detail?: string): Signal => ({ level: "bear", label, detail });
const neutral = (label: string, detail?: string): Signal => ({ level: "neutral", label, detail });
const na = (label: string): Signal => ({ level: "na", label });

export function sigMA(price?: number, ma?: number, name = "50d MA"): Signal {
  if (price == null || ma == null) return na(`${name} n/a`);
  const diff = ((price - ma) / ma) * 100;
  const detail = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  if (diff >= 2) return bull(`Above ${name}`, detail);
  if (diff <= -2) return bear(`Below ${name}`, detail);
  return neutral(`At ${name}`, detail);
}

export function sig52w(price?: number, high?: number, low?: number): Signal {
  if (price == null || high == null || low == null) return na("52w range n/a");
  const fromHigh = ((price - high) / high) * 100;
  const rangePct = ((price - low) / (high - low)) * 100;
  const detail = `${rangePct.toFixed(0)}% of range`;
  if (fromHigh >= -3) return neutral("At 52w high", detail);
  if (fromHigh >= -15) return bull("Upper range", detail);
  if (fromHigh >= -35) return neutral("Mid range", detail);
  return bear("Lower range", detail);
}

export function sigPE(pe?: number): Signal {
  if (pe == null) return na("P/E n/a");
  if (pe < 0) return bear("Unprofitable (P/E)", `${pe.toFixed(1)}x`);
  if (pe < 12) return bull("Cheap P/E", `${pe.toFixed(1)}x`);
  if (pe < 22) return neutral("Fair P/E", `${pe.toFixed(1)}x`);
  if (pe < 40) return bear("Rich P/E", `${pe.toFixed(1)}x`);
  return bear("Very rich P/E", `${pe.toFixed(1)}x`);
}

export function sigFwdPE(fwd?: number, trailing?: number): Signal {
  if (fwd == null) return na("Fwd P/E n/a");
  if (fwd < 0) return bear("Fwd earnings negative");
  const base = `${fwd.toFixed(1)}x`;
  if (trailing != null && trailing > 0) {
    const chg = ((fwd - trailing) / trailing) * 100;
    if (chg < -15) return bull("Fwd P/E improving", `${base} (earnings rising)`);
    if (chg > 15) return bear("Fwd P/E rising", `${base} (earnings falling)`);
  }
  if (fwd < 15) return bull("Low Fwd P/E", base);
  if (fwd < 25) return neutral("Fair Fwd P/E", base);
  return bear("Rich Fwd P/E", base);
}

export function sigEvEbitda(ev?: number): Signal {
  if (ev == null) return na("EV/EBITDA n/a");
  if (ev < 0) return bear("EBITDA negative");
  if (ev < 10) return bull("Cheap EV/EBITDA", `${ev.toFixed(1)}x`);
  if (ev < 18) return neutral("Fair EV/EBITDA", `${ev.toFixed(1)}x`);
  return bear("Rich EV/EBITDA", `${ev.toFixed(1)}x`);
}

export function sigMargin(margin?: number, kind: "gross" | "op" | "net" = "op"): Signal {
  if (margin == null) return na(`${kind} margin n/a`);
  const pct = margin * 100;
  const label = kind === "gross" ? "Gross margin" : kind === "op" ? "Operating margin" : "Net margin";
  const detail = `${pct.toFixed(1)}%`;
  const thresholds = { gross: [20, 40], op: [8, 18], net: [5, 12] } as const;
  const [low, hi] = thresholds[kind];
  if (pct >= hi) return bull(`${label} strong`, detail);
  if (pct >= low) return neutral(`${label} average`, detail);
  if (pct > 0) return bear(`${label} thin`, detail);
  return bear(`${label} negative`, detail);
}

export function sigGrowth(rate?: number, what = "Revenue"): Signal {
  if (rate == null) return na(`${what} growth n/a`);
  const pct = rate * 100;
  const detail = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% YoY`;
  if (pct >= 15) return bull(`${what} accelerating`, detail);
  if (pct >= 5) return bull(`${what} growing`, detail);
  if (pct >= 0) return neutral(`${what} flat`, detail);
  if (pct > -10) return bear(`${what} declining`, detail);
  return bear(`${what} shrinking`, detail);
}

export function sigAnalystUpside(current?: number, target?: number): Signal {
  if (current == null || target == null) return na("Analyst target n/a");
  const up = ((target - current) / current) * 100;
  const detail = `${up >= 0 ? "+" : ""}${up.toFixed(1)}% to target`;
  if (up >= 15) return bull("Bullish analyst target", detail);
  if (up >= 0) return neutral("Target near price", detail);
  return bear("Target below price", detail);
}

export function sigAnalystRec(rec?: string, score?: number): Signal {
  if (!rec) return na("No analyst coverage");
  const up = rec.toUpperCase();
  const s = score ?? 3;
  const detail = `score ${s.toFixed(2)}/5 (1=strong buy)`;
  if (/STRONG.BUY/.test(up) || s <= 1.8) return bull("Strong buy consensus", detail);
  if (/BUY/.test(up) || s <= 2.5) return bull("Buy consensus", detail);
  if (/HOLD|NEUTRAL/.test(up) || s <= 3.5) return neutral("Hold consensus", detail);
  return bear("Sell/underperform", detail);
}

export function sigDebtEquity(de?: number): Signal {
  if (de == null) return na("D/E n/a");
  const detail = `${de.toFixed(2)}`;
  if (de < 0.5) return bull("Low leverage", detail);
  if (de < 1.5) return neutral("Moderate leverage", detail);
  if (de < 3) return bear("High leverage", detail);
  return bear("Very high leverage", detail);
}

export function sigDividend(yieldDec?: number, payout?: number): Signal {
  if (yieldDec == null || yieldDec === 0) return neutral("No dividend");
  const y = yieldDec * 100;
  const yLabel = `${y.toFixed(2)}% yield`;
  if (payout != null) {
    const p = payout * 100;
    if (p > 90) return bear("Stretched payout", `${yLabel} · ${p.toFixed(0)}% payout`);
    if (p > 60) return neutral("High payout", `${yLabel} · ${p.toFixed(0)}% payout`);
    if (p > 0) return bull("Healthy payout", `${yLabel} · ${p.toFixed(0)}% payout`);
  }
  return neutral(yLabel);
}

// ────── Technical classifiers ──────
// These read the values produced by lib/indicators.ts. Overbought/oversold is
// deliberately read as a mean-reversion signal: an oversold tape is the bullish
// side of the trade, which is the opposite of what the raw number looks like.

export function sigRSI(rsi?: number): Signal {
  if (rsi == null) return na("RSI n/a");
  const detail = rsi.toFixed(1);
  if (rsi < 30) return bull("Oversold (RSI)", detail);
  if (rsi < 45) return neutral("RSI soft", detail);
  if (rsi <= 55) return neutral("RSI neutral", detail);
  if (rsi <= 70) return neutral("RSI firm", detail);
  return bear("Overbought (RSI)", detail);
}

export function sigMACD(
  macd?: number, signal?: number, prevMacd?: number, prevSignal?: number
): Signal {
  if (macd == null || signal == null) return na("MACD n/a");
  const hist = macd - signal;
  const detail = `hist ${hist >= 0 ? "+" : ""}${hist.toFixed(2)}`;
  if (prevMacd != null && prevSignal != null) {
    const wasBelow = prevMacd <= prevSignal;
    const isAbove = macd > signal;
    // A cross that happened on this bar is the strong read; a position held for
    // weeks says much less.
    if (wasBelow && isAbove) return bull("MACD bullish cross", detail);
    if (!wasBelow && !isAbove) return bear("MACD bearish cross", detail);
  }
  if (hist > 0) return bull("MACD above signal", detail);
  if (hist < 0) return bear("MACD below signal", detail);
  return neutral("MACD flat", detail);
}

export function sigBollinger(percentB?: number, bandwidth?: number): Signal {
  if (percentB == null) return na("Bollinger n/a");
  const detail = bandwidth == null
    ? `%B ${percentB.toFixed(0)}`
    : `%B ${percentB.toFixed(0)} · width ${bandwidth.toFixed(1)}%`;
  if (percentB > 100) return bear("Above upper band", detail);
  if (percentB > 80) return neutral("Upper band", detail);
  if (percentB < 0) return bull("Below lower band", detail);
  if (percentB < 20) return bull("Lower band", detail);
  return neutral("Mid band", detail);
}

export function sigADX(adx?: number, plusDI?: number, minusDI?: number): Signal {
  if (adx == null) return na("ADX n/a");
  const detail = `ADX ${adx.toFixed(1)}`;
  // Below 20 the directional indicators are noise, so direction is not read.
  if (adx < 20) return neutral("No trend", detail);
  if (plusDI == null || minusDI == null) return neutral("Trending", detail);
  const strength = adx >= 40 ? "Strong" : "";
  if (plusDI > minusDI) return bull(`${strength} uptrend`.trim(), detail);
  return bear(`${strength} downtrend`.trim(), detail);
}

export function sigCross(
  fast?: number, slow?: number, prevFast?: number, prevSlow?: number
): Signal {
  if (fast == null || slow == null) return na("50/200 cross n/a");
  const gap = ((fast - slow) / slow) * 100;
  const detail = `50d ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}% vs 200d`;
  if (prevFast != null && prevSlow != null) {
    if (prevFast <= prevSlow && fast > slow) return bull("Golden cross", detail);
    if (prevFast >= prevSlow && fast < slow) return bear("Death cross", detail);
  }
  if (fast > slow) return bull("50d above 200d", detail);
  return bear("50d below 200d", detail);
}

/**
 * ATR as a share of price. High volatility is not directional, so it is never
 * bullish — it is either unremarkable or a risk flag.
 */
export function sigVolatility(atr?: number, price?: number): Signal {
  if (atr == null || price == null || price === 0) return na("Volatility n/a");
  const pct = (atr / price) * 100;
  const detail = `ATR ${pct.toFixed(2)}% of price`;
  if (pct < 1.5) return neutral("Calm tape", detail);
  if (pct < 3) return neutral("Normal volatility", detail);
  if (pct < 5) return bear("Elevated volatility", detail);
  return bear("Very volatile", detail);
}

export function sigOBV(obv?: number, prevObv?: number): Signal {
  if (obv == null || prevObv == null) return na("OBV n/a");
  if (obv > prevObv) return bull("Volume confirming", "OBV rising");
  if (obv < prevObv) return bear("Volume diverging", "OBV falling");
  return neutral("Volume flat", "OBV unchanged");
}

export interface ScoreTally {
  bull: number;
  bear: number;
  neutral: number;
  na: number;
  net: number; // bull - bear
  verdict: "Bullish" | "Bearish" | "Mixed" | "Sparse";
}

export function tally(signals: Signal[]): ScoreTally {
  const counts = { bull: 0, bear: 0, neutral: 0, na: 0 };
  for (const s of signals) counts[s.level]++;
  const informative = signals.length - counts.na;
  const net = counts.bull - counts.bear;
  let verdict: ScoreTally["verdict"] = "Mixed";
  if (informative < 3) verdict = "Sparse";
  else if (net >= Math.max(2, Math.ceil(informative * 0.4))) verdict = "Bullish";
  else if (net <= -Math.max(2, Math.ceil(informative * 0.4))) verdict = "Bearish";
  return { ...counts, net, verdict };
}

export const levelColor = (lvl: SignalLevel) =>
  lvl === "bull" ? "text-term-heading" : lvl === "bear" ? "text-term-text" : "text-term-muted";
export const levelDot = (lvl: SignalLevel) =>
  lvl === "bull" ? "bg-term-heading" : lvl === "bear" ? "bg-transparent border border-term-heading" : lvl === "neutral" ? "bg-term-muted" : "bg-term-border";
