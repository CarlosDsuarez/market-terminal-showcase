// Return and risk statistics. Pure functions over an equity series.
//
// PERF, RISK and BT all score through here, so a backtest and a hand-entered
// portfolio are measured by exactly the same arithmetic.

/** Trading days per year — the convention for annualising daily series. */
export const PERIODS_PER_YEAR = 252;

export const mean = (xs: number[]) =>
  xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Sample standard deviation. n-1 because an equity curve is a sample, not the population. */
export function stdev(xs: number[]): number | undefined {
  if (xs.length < 2) return undefined;
  const m = mean(xs)!;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Simple period-over-period returns. A non-positive base is skipped, not divided by.
 *  The result is shorter than `values.length - 1` when a skip happens — do not zip
 *  it with dates by index. Use `datedReturns` when a date has to travel with the return. */
export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev <= 0) continue;
    out.push(values[i] / prev - 1);
  }
  return out;
}

export interface DatedReturn { date: string; ret: number }

/** Period-over-period returns stamped with the ending bar's date. */
export function datedReturns(values: number[], dates: string[]): DatedReturn[] {
  const n = Math.min(values.length, dates.length);
  const out: DatedReturn[] = [];
  for (let i = 1; i < n; i++) {
    if (values[i - 1] > 0) out.push({ date: dates[i], ret: values[i] / values[i - 1] - 1 });
  }
  return out;
}

/** Intersect two dated series. Dates present in only one side are dropped. */
export function alignByDate(a: Map<string, number>, b: Map<string, number>) {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  return { a: dates.map((d) => a.get(d)!), b: dates.map((d) => b.get(d)!), dates };
}

export function returnsByDate(candles: { date: string; close: number }[]): Map<string, number> {
  const d = datedReturns(candles.map((c) => c.close), candles.map((c) => c.date));
  return new Map(d.map((x) => [x.date, x.ret]));
}

export function totalReturn(values: number[]): number | undefined {
  if (values.length < 2 || values[0] <= 0) return undefined;
  return values[values.length - 1] / values[0] - 1;
}

export function cagr(values: number[], years: number): number | undefined {
  if (values.length < 2 || values[0] <= 0 || years <= 0) return undefined;
  const growth = values[values.length - 1] / values[0];
  if (growth <= 0) return undefined;
  return growth ** (1 / years) - 1;
}

export function annVol(returns: number[]): number | undefined {
  const sd = stdev(returns);
  return sd == null ? undefined : sd * Math.sqrt(PERIODS_PER_YEAR);
}

/** Excess return per unit of total volatility, annualised. `rf` is an annual rate. */
export function sharpe(returns: number[], rf = 0): number | undefined {
  const sd = stdev(returns);
  const m = mean(returns);
  if (sd == null || m == null || sd === 0) return undefined;
  const dailyRf = rf / PERIODS_PER_YEAR;
  return ((m - dailyRf) / sd) * Math.sqrt(PERIODS_PER_YEAR);
}

/**
 * Sharpe but penalising only downside deviation, so a portfolio is not punished
 * for the upside half of its volatility.
 */
export function sortino(returns: number[], rf = 0): number | undefined {
  const m = mean(returns);
  if (m == null || returns.length < 2) return undefined;
  const dailyRf = rf / PERIODS_PER_YEAR;
  const downside = returns.filter((r) => r < dailyRf).map((r) => (r - dailyRf) ** 2);
  if (downside.length === 0) return undefined;
  const dd = Math.sqrt(downside.reduce((a, b) => a + b, 0) / returns.length);
  if (dd === 0) return undefined;
  return ((m - dailyRf) / dd) * Math.sqrt(PERIODS_PER_YEAR);
}

export interface DrawdownResult {
  /** Worst peak-to-trough decline as a negative decimal. */
  maxDrawdown: number;
  peakDate?: string;
  troughDate?: string;
  /** Drawdown at every point, for plotting the underwater curve. */
  series: number[];
}

export function maxDrawdown(values: number[], dates?: string[]): DrawdownResult {
  let peak = -Infinity;
  let peakIdx = 0;
  let worst = 0;
  let worstPeakIdx = 0;
  let worstIdx = 0;
  const series: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) { peak = values[i]; peakIdx = i; }
    const dd = peak > 0 ? values[i] / peak - 1 : 0;
    series.push(dd);
    if (dd < worst) { worst = dd; worstPeakIdx = peakIdx; worstIdx = i; }
  }

  return {
    maxDrawdown: worst,
    peakDate: dates?.[worstPeakIdx],
    troughDate: dates?.[worstIdx],
    series,
  };
}

/** Annual return per unit of worst drawdown. */
export function calmar(cagrValue?: number, maxDd?: number): number | undefined {
  if (cagrValue == null || maxDd == null || maxDd === 0) return undefined;
  return cagrValue / Math.abs(maxDd);
}

export interface BetaAlpha { beta?: number; alpha?: number; rSquared?: number; }

/**
 * Regress the portfolio on its benchmark. Alpha is annualised; beta and R² are
 * unitless. Returns must already be aligned to the same dates.
 */
export function betaAlpha(returns: number[], bench: number[], rf = 0): BetaAlpha {
  const n = Math.min(returns.length, bench.length);
  if (n < 2) return {};
  const a = returns.slice(0, n);
  const b = bench.slice(0, n);
  const ma = mean(a)!;
  const mb = mean(b)!;
  let cov = 0;
  let varB = 0;
  let varA = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    varB += (b[i] - mb) ** 2;
    varA += (a[i] - ma) ** 2;
  }
  if (varB === 0) return {};
  const beta = cov / varB;
  const dailyRf = rf / PERIODS_PER_YEAR;
  const alpha = (ma - dailyRf - beta * (mb - dailyRf)) * PERIODS_PER_YEAR;
  const rSquared = varA === 0 ? undefined : (cov * cov) / (varA * varB);
  return { beta, alpha, rSquared };
}

export function correlation(a: number[], b: number[]): number | undefined {
  const n = Math.min(a.length, b.length);
  if (n < 2) return undefined;
  const ma = mean(a.slice(0, n))!;
  const mb = mean(b.slice(0, n))!;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return undefined;
  return cov / Math.sqrt(va * vb);
}

/**
 * Historical (not parametric) VaR: the empirical 5th percentile of daily
 * returns, reported as a negative decimal. No normality assumed, because return
 * distributions are not normal in the tail that matters.
 */
export function historicalVar95(returns: number[]): number | undefined {
  if (returns.length < 20) return undefined;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.05);
  return sorted[idx];
}

export interface Extremes {
  best?: number; bestDate?: string;
  worst?: number; worstDate?: string;
}

/** `dates` should be the return dates — that is, the equity dates minus the first. */
export function bestWorst(returns: number[], dates?: string[]): Extremes {
  if (returns.length === 0) return {};
  let bi = 0;
  let wi = 0;
  for (let i = 1; i < returns.length; i++) {
    if (returns[i] > returns[bi]) bi = i;
    if (returns[i] < returns[wi]) wi = i;
  }
  return {
    best: returns[bi], bestDate: dates?.[bi],
    worst: returns[wi], worstDate: dates?.[wi],
  };
}

/** Share of periods that were positive. */
export function hitRate(returns: number[]): number | undefined {
  if (returns.length === 0) return undefined;
  return returns.filter((r) => r > 0).length / returns.length;
}

/** Fractional years between two ISO dates, for annualising. */
export function yearsBetween(startIso: string, endIso: string): number {
  const ms = Date.parse(endIso + "T00:00:00Z") - Date.parse(startIso + "T00:00:00Z");
  return ms / (365.25 * 24 * 3600 * 1000);
}

export interface PerfSummary {
  totalReturn?: number;
  cagr?: number;
  annVol?: number;
  sharpe?: number;
  sortino?: number;
  maxDrawdown?: number;
  peakDate?: string;
  troughDate?: string;
  calmar?: number;
  var95?: number;
  hitRate?: number;
  best?: number; bestDate?: string;
  worst?: number; worstDate?: string;
  beta?: number; alpha?: number; rSquared?: number;
}

/** Everything PERF and RISK display, computed in one pass. */
export function summarize(
  values: number[],
  dates: string[],
  bench?: { values: number[]; dates: string[] },
  rf = 0
): PerfSummary {
  const dated = datedReturns(values, dates);
  const rets = dated.map((d) => d.ret);
  const retDates = dated.map((d) => d.date);
  const dd = maxDrawdown(values, dates);
  const years = dates.length >= 2 ? yearsBetween(dates[0], dates[dates.length - 1]) : 0;
  const c = cagr(values, years);
  const ext = bestWorst(rets, retDates);
  let ba: BetaAlpha = {};
  if (bench && bench.values.length >= 2) {
    const bd = datedReturns(bench.values, bench.dates);
    const aligned = alignByDate(
      new Map(dated.map((x) => [x.date, x.ret])),
      new Map(bd.map((x) => [x.date, x.ret])),
    );
    if (aligned.dates.length >= 2) ba = betaAlpha(aligned.a, aligned.b, rf);
  }

  return {
    totalReturn: totalReturn(values),
    cagr: c,
    annVol: annVol(rets),
    sharpe: sharpe(rets, rf),
    sortino: sortino(rets, rf),
    maxDrawdown: dd.maxDrawdown,
    peakDate: dd.peakDate,
    troughDate: dd.troughDate,
    calmar: calmar(c, dd.maxDrawdown),
    var95: historicalVar95(rets),
    hitRate: hitRate(rets),
    ...ext,
    ...ba,
  };
}
