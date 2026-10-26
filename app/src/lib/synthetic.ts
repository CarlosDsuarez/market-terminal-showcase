// Seeded synthetic market data for the offline demo.
//
// Every response is a deterministic function of (path, params): the same symbol
// always produces the same price history, so charts, backtests and the portfolio
// engine behave consistently across panels and reloads. Nothing here is real
// market data — prices are geometric Brownian motion paths seeded by a hash of
// the symbol, fundamentals are drawn from plausible ranges, and headlines are
// placeholders. Shapes mirror the OpenBB responses the panels already consume.

import { parseIso, toIso, todayIso } from "./asOf";

type Params = Record<string, string>;

// ────── PRNG ──────

/** FNV-1a: stable 32-bit seed from any string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for demo data. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ────── Universe ──────

/** Clearly fictional tickers used for movers, screener and search. */
export const UNIVERSE = [
  "ALFA", "BRVO", "CHRL", "DLTA", "ECHO", "FXTR", "GOLF", "HTEL", "INDA", "JLET",
  "KILO", "LIMA", "MIKE", "NOVA", "OSCR", "PAPA", "QBEC", "ROMO", "SRRA", "TNGO",
  "UNIF", "VCTR", "WSKY", "XRAY", "YANK", "ZULU", "ARCO", "BETA", "CRUX", "DUNE",
] as const;

const SECTORS = [
  "Technology", "Healthcare", "Financial", "Energy", "Industrials", "Utilities",
  "Consumer Cyclical", "Consumer Defensive", "Communication Services", "Real Estate", "Basic Materials",
] as const;

type Kind = "equity" | "index" | "fx" | "crypto";

function kindOf(symbol: string): Kind {
  const s = symbol.toUpperCase();
  if (s.startsWith("^")) return "index";
  if (s.endsWith("-USD") || (s.endsWith("USD") && s.length > 6)) return "crypto";
  if (/^[A-Z]{6}(=X)?$/.test(s) && /(USD|EUR|JPY|GBP|CHF|CAD|AUD|COP|MXN|BRL)/.test(s)) return "fx";
  return "equity";
}

function traits(symbol: string) {
  const r = rng(hash(`traits:${symbol}`));
  const kind = kindOf(symbol);
  const start =
    kind === "index" ? between(r, 2_000, 20_000)
    : kind === "fx" ? between(r, 0.5, 1.6)
    : kind === "crypto" ? between(r, 1, 40_000)
    : between(r, 15, 400);
  const vol =
    kind === "index" ? between(r, 0.12, 0.22)
    : kind === "fx" ? between(r, 0.05, 0.12)
    : kind === "crypto" ? between(r, 0.5, 0.9)
    : between(r, 0.18, 0.5);
  const drift = between(r, -0.02, 0.12);
  const sector = pick(r, SECTORS);
  const shares = Math.round(between(r, 50, 5_000)) * 1e6;
  const beta = round(between(r, 0.5, 1.8));
  const divYieldPct = r() < 0.55 ? round(between(r, 0.4, 5)) : 0; // percent, like yfinance
  const employees = Math.round(between(r, 500, 150_000));
  return { kind, start, vol, drift, sector, shares, beta, divYieldPct, employees };
}

// ────── Prices ──────

interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

const EPOCH = "2010-01-04";
const cache = new Map<string, Bar[]>();

function isBusinessDay(d: Date) {
  const w = d.getDay();
  return w !== 0 && w !== 6;
}

/** Full daily history from EPOCH to today, generated once per symbol. */
function history(symbol: string): Bar[] {
  const hit = cache.get(symbol);
  if (hit) return hit;
  const t = traits(symbol);
  const r = rng(hash(`px:${symbol}`));
  const daily = t.vol / Math.sqrt(252);
  const mu = t.drift / 252 - 0.5 * daily * daily;
  const out: Bar[] = [];
  const end = parseIso(todayIso());
  const crypto = t.kind === "crypto";
  const dp = t.kind === "fx" ? 5 : 2;
  const baseVol = t.kind === "equity" ? between(r, 1e6, 3e7) : crypto ? between(r, 1e7, 1e9) : 0;
  let prev = t.start;
  for (const d = parseIso(EPOCH); d <= end; d.setDate(d.getDate() + 1)) {
    if (!crypto && !isBusinessDay(d)) continue;
    const close = prev * Math.exp(mu + daily * gauss(r));
    const open = prev * Math.exp(daily * 0.25 * gauss(r));
    const hi = Math.max(open, close) * (1 + Math.abs(daily * 0.6 * gauss(r)));
    const lo = Math.min(open, close) * (1 - Math.abs(daily * 0.6 * gauss(r)));
    out.push({
      date: toIso(d),
      open: round(open, dp), high: round(hi, dp), low: round(lo, dp), close: round(close, dp),
      volume: baseVol ? Math.round(baseVol * Math.exp(0.35 * gauss(r))) : 0,
    });
    prev = close;
  }
  cache.set(symbol, out);
  return out;
}

function window(symbol: string, p: Params): Bar[] {
  const end = p.end_date ?? todayIso();
  const start = p.start_date ?? "0000-01-01";
  return history(symbol).filter((c) => c.date >= start && c.date <= end);
}

/** History up to the requested (or simulation) date — what "now" means for quotes. */
function upTo(symbol: string, p: Params): Bar[] {
  const end = p.end_date ?? todayIso();
  return history(symbol).filter((c) => c.date <= end);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function displayName(symbol: string) {
  const k = kindOf(symbol);
  if (k === "index") return `Synthetic Index ${symbol.replace("^", "")}`;
  if (k === "fx") return `${symbol.slice(0, 3)}/${symbol.slice(3, 6)} (synthetic)`;
  if (k === "crypto") return `${symbol.replace("-USD", "")} (synthetic)`;
  return `${symbol} Synthetic Corp.`;
}

function quote(symbol: string, p: Params) {
  const h = upTo(symbol, p);
  const last = h[h.length - 1];
  const prev = h[h.length - 2] ?? last;
  const yr = h.slice(-252);
  const closes = h.map((c) => c.close);
  const spread = last.close * 0.0005;
  return {
    symbol, name: displayName(symbol), exchange: "SYNTH",
    last_price: last.close, open: last.open, high: last.high, low: last.low, prev_close: prev.close,
    bid: round(last.close - spread), ask: round(last.close + spread), bid_size: 100, ask_size: 100,
    volume: last.volume, volume_average: Math.round(mean(h.slice(-20).map((c) => c.volume))),
    year_high: Math.max(...yr.map((c) => c.high)), year_low: Math.min(...yr.map((c) => c.low)),
    ma_50d: round(mean(closes.slice(-50))), ma_200d: round(mean(closes.slice(-200))),
    currency: "USD",
  };
}

// ────── Fundamentals ──────

function profile(symbol: string, p: Params) {
  const t = traits(symbol);
  const px = quote(symbol, p).last_price;
  return {
    symbol, name: displayName(symbol), stock_exchange: "SYNTH",
    long_description:
      `${displayName(symbol)} is a fictional company generated for the offline demo. ` +
      "All figures on this screen are synthetic and do not describe any real issuer.",
    hq_address_city: "Demo City", hq_country: "N/A",
    employees: t.employees,
    sector: t.sector, industry_category: `${t.sector} (synthetic)`, issue_type: "Common Stock", currency: "USD",
    market_cap: Math.round(px * t.shares), shares_outstanding: t.shares, shares_float: Math.round(t.shares * 0.92),
    dividend_yield: t.divYieldPct, beta: t.beta,
  };
}

function metrics(symbol: string, p: Params) {
  const t = traits(symbol);
  const r = rng(hash(`m:${symbol}`));
  const px = quote(symbol, p).last_price;
  const pe = round(between(r, 8, 45));
  const pb = round(between(r, 1.2, 8));
  return {
    symbol, market_cap: Math.round(px * t.shares), pe_ratio: pe, forward_pe: round(pe * between(r, 0.75, 1.05)),
    peg_ratio: round(between(r, 0.6, 3)), enterprise_to_ebitda: round(between(r, 6, 30)),
    revenue_growth: round(between(r, -0.05, 0.3), 4), earnings_growth: round(between(r, -0.2, 0.4), 4),
    quick_ratio: round(between(r, 0.5, 2.5)), current_ratio: round(between(r, 0.8, 3)),
    debt_to_equity: round(between(r, 0.1, 2.5)), gross_margin: round(between(r, 0.2, 0.75), 4),
    operating_margin: round(between(r, 0.05, 0.4), 4), profit_margin: round(between(r, 0.02, 0.3), 4),
    return_on_assets: round(between(r, 0.01, 0.2), 4), return_on_equity: round(between(r, 0.05, 0.45), 4),
    dividend_yield: t.divYieldPct, payout_ratio: t.divYieldPct ? round(between(r, 0.1, 0.7), 4) : 0,
    book_value: round(px / pb), price_to_book: pb,
    enterprise_value: Math.round(px * t.shares * between(r, 1, 1.3)),
  };
}

function income(symbol: string, p: Params) {
  const r = rng(hash(`is:${symbol}`));
  const shares = traits(symbol).shares;
  const year = Number((p.end_date ?? todayIso()).slice(0, 4)) - 1;
  let rev = between(r, 1e9, 1e11);
  const rows = [];
  for (let i = 0; i < Number(p.limit ?? 5); i++) {
    const gm = between(r, 0.3, 0.6);
    const om = gm * between(r, 0.3, 0.6);
    const ni = rev * om * 0.78;
    rows.push({
      period_ending: `${year - i}-12-31`,
      total_revenue: Math.round(rev), cost_of_revenue: Math.round(rev * (1 - gm)), gross_profit: Math.round(rev * gm),
      operating_income: Math.round(rev * om), total_pre_tax_income: Math.round(rev * om * 0.97), net_income: Math.round(ni),
      basic_earnings_per_share: round(ni / shares), diluted_earnings_per_share: round((ni / shares) * 0.99),
      research_and_development_expense: Math.round(rev * 0.08), selling_general_and_admin_expense: Math.round(rev * 0.12),
    });
    rev /= 1 + between(r, -0.03, 0.15);
  }
  return rows;
}

function dividends(symbol: string, p: Params) {
  const t = traits(symbol);
  if (!t.divYieldPct) return [];
  const h = upTo(symbol, p);
  const out = [];
  for (let i = h.length - 1; i >= 0 && out.length < 24; i -= 63) {
    out.push({ ex_dividend_date: h[i].date, amount: round((h[i].close * t.divYieldPct) / 100 / 4, 4) });
  }
  return out.reverse();
}

function consensus(symbol: string, p: Params) {
  const r = rng(hash(`ee:${symbol}`));
  const px = quote(symbol, p).last_price;
  const mid = px * between(r, 0.9, 1.3);
  const rec = round(between(r, 1.5, 3.5));
  return {
    symbol, target_high: round(mid * 1.25), target_low: round(mid * 0.75), target_consensus: round(mid), target_median: round(mid * 0.99),
    recommendation: rec < 2 ? "buy" : rec < 3 ? "hold" : "underperform", recommendation_mean: rec,
    number_of_analysts: Math.round(between(r, 3, 35)), current_price: px, currency: "USD",
  };
}

function news(symbol: string, p: Params) {
  const h = upTo(symbol, p);
  const n = Math.min(Number(p.limit ?? 10), 10);
  return Array.from({ length: n }, (_, i) => ({
    id: `${symbol}-${i}`,
    date: `${h[Math.max(0, h.length - 1 - i * 3)].date}T13:30:00`,
    title: `[Synthetic] ${symbol}: placeholder headline ${i + 1} for the offline demo`,
    url: "#", source: "Synthetic feed", symbol,
    summary: "Generated text. No real news source is used in synthetic mode.",
  }));
}

// ────── Market-wide ──────

function movers(kind: "gainers" | "losers" | "active", p: Params) {
  const rows = UNIVERSE.map((s) => {
    const q = quote(s, p);
    const change = round(q.last_price - q.prev_close);
    return {
      symbol: s, name: displayName(s), price: q.last_price, change,
      percent_change: round(change / q.prev_close, 4), volume: q.volume,
      market_cap: Math.round(q.last_price * traits(s).shares), exchange: "SYNTH",
    };
  });
  if (kind === "gainers") rows.sort((a, b) => b.percent_change - a.percent_change);
  if (kind === "losers") rows.sort((a, b) => a.percent_change - b.percent_change);
  if (kind === "active") rows.sort((a, b) => b.volume - a.volume);
  return rows.slice(0, 15);
}

const TENORS = ["month_1", "month_3", "month_6", "year_1", "year_2", "year_3", "year_5", "year_7", "year_10", "year_20", "year_30"] as const;

function treasury(p: Params) {
  // A synthetic index path drives the level; the curve is a fixed upward slope on top.
  const base = history("^SYNTHRATES");
  const lo = Math.min(...base.map((c) => c.close));
  const hi = Math.max(...base.map((c) => c.close));
  return window("^SYNTHRATES", p).map((c) => {
    const short = 0.25 + ((c.close - lo) / Math.max(1e-9, hi - lo)) * 4.75;
    const row: Record<string, number | string> = { date: c.date };
    // OpenBB returns rates as decimals (0.045 = 4.5%).
    TENORS.forEach((k, i) => { row[k] = round((short + i * 0.12) / 100, 5); });
    return row;
  });
}

function options(symbol: string, p: Params) {
  const px = quote(symbol, p).last_price;
  const r = rng(hash(`opt:${symbol}`));
  const iv0 = traits(symbol).vol;
  const today = parseIso(p.end_date ?? todayIso());
  const rows = [];
  for (const dte of [7, 30, 90]) {
    const exp = new Date(today);
    exp.setDate(exp.getDate() + dte);
    const t = Math.sqrt(dte / 365);
    for (let k = -5; k <= 5; k++) {
      const strike = round(px * (1 + k * 0.025));
      for (const option_type of ["call", "put"] as const) {
        const iv = iv0 * (1 + 0.04 * Math.abs(k));
        const intrinsic = Math.max(0, option_type === "call" ? px - strike : strike - px);
        // Rough time value (ATM ≈ 0.4·S·σ·√t, decaying away from the money) — demo only, not a pricing model.
        const mid = intrinsic + px * iv * t * 0.4 * Math.exp(-0.5 * ((k * 0.025) / (iv * t)) ** 2);
        rows.push({
          underlying_symbol: symbol, underlying_price: px,
          contract_symbol: `${symbol}${toIso(exp).replace(/-/g, "").slice(2)}${option_type[0].toUpperCase()}${Math.round(strike * 1000)}`,
          expiration: toIso(exp), dte, strike, option_type,
          open_interest: Math.round(between(r, 10, 5000)), volume: Math.round(between(r, 0, 2000)),
          last_trade_price: round(mid), bid: round(mid * 0.98), ask: round(mid * 1.02),
          implied_volatility: round(iv, 4), in_the_money: intrinsic > 0,
        });
      }
    }
  }
  return rows;
}

function screener(p: Params) {
  const rows = UNIVERSE.map((s) => {
    const q = quote(s, p);
    const m = metrics(s, p);
    const pr = profile(s, p);
    const r = rng(hash(`scr:${s}`));
    const h = upTo(s, p);
    const ret = (n: number) => (h.length > n ? round(q.last_price / h[h.length - 1 - n].close - 1, 4) : undefined);
    return {
      symbol: s, name: pr.name, sector: pr.sector, industry: pr.industry_category, country: "N/A",
      market_cap: m.market_cap, price: q.last_price, change_percent: round(q.last_price / q.prev_close - 1, 4),
      volume: q.volume, volume_avg: q.volume_average, volume_relative: round(q.volume / Math.max(1, q.volume_average)),
      price_to_earnings: m.pe_ratio, forward_pe: m.forward_pe, peg_ratio: m.peg_ratio,
      price_to_sales: round(between(r, 0.5, 12)), price_to_book: m.price_to_book,
      price_to_cash: round(between(r, 2, 40)), price_to_fcf: round(between(r, 8, 60)),
      dividend_yield: pr.dividend_yield / 100, return_on_assets: m.return_on_assets, return_on_equity: m.return_on_equity,
      current_ratio: m.current_ratio, quick_ratio: m.quick_ratio, debt_to_equity: m.debt_to_equity,
      long_term_debt_to_equity: round(m.debt_to_equity * 0.8), gross_margin: m.gross_margin,
      operating_margin: m.operating_margin, profit_margin: m.profit_margin,
      shares_outstanding: pr.shares_outstanding, shares_float: pr.shares_float,
      insider_ownership: round(between(r, 0, 0.2), 4), institutional_ownership: round(between(r, 0.3, 0.9), 4),
      short_interest: round(between(r, 0.005, 0.15), 4), short_ratio: round(between(r, 0.5, 6)),
      beta: pr.beta, rsi: round(between(r, 20, 80)),
      price_change_1w: ret(5), price_change_1m: ret(21), price_change_3m: ret(63),
      price_change_6m: ret(126), price_change_1y: ret(252),
    };
  });
  const sig = p.signal;
  if (sig === "top_gainers") rows.sort((a, b) => b.change_percent - a.change_percent);
  else if (sig === "top_losers") rows.sort((a, b) => a.change_percent - b.change_percent);
  else if (sig === "most_active") rows.sort((a, b) => b.volume - a.volume);
  else if (sig === "overbought") rows.sort((a, b) => b.rsi - a.rsi);
  else if (sig === "oversold") rows.sort((a, b) => a.rsi - b.rsi);
  return rows.slice(0, Number(p.limit ?? rows.length));
}

function groups(p: Params) {
  const r = rng(hash(`grp:${p.group}`));
  return SECTORS.map((name) => ({
    name, stocks: Math.round(between(r, 50, 800)), market_cap: Math.round(between(r, 5e11, 1.5e13)),
    performance_1d: round(between(r, -0.02, 0.02), 4), performance_1w: round(between(r, -0.04, 0.04), 4),
    performance_1m: round(between(r, -0.08, 0.08), 4), performance_3m: round(between(r, -0.12, 0.15), 4),
    performance_6m: round(between(r, -0.15, 0.2), 4), performance_1y: round(between(r, -0.2, 0.35), 4),
    performance_ytd: round(between(r, -0.15, 0.25), 4), dividend_yield: round(between(r, 0.005, 0.04), 4),
    pe: round(between(r, 10, 35)), forward_pe: round(between(r, 9, 30)), peg: round(between(r, 0.8, 3)),
    volume: Math.round(between(r, 1e8, 2e9)), volume_average: Math.round(between(r, 1e8, 2e9)),
    volume_relative: round(between(r, 0.7, 1.4)),
  }));
}

// ────── Router ──────

const symbolsOf = (p: Params) => (p.symbol ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function historical(p: Params) {
  const syms = symbolsOf(p);
  if (syms.length <= 1) return window(syms[0] ?? "ALFA", p);
  return syms.flatMap((s) => window(s, p).map((c) => ({ ...c, symbol: s })));
}

export class SyntheticNotAvailable extends Error {}

/** Answer an OpenBB-style `path` + query params with synthetic `results`. */
export function syntheticGet(path: string, p: Params): unknown {
  const sym = symbolsOf(p)[0] ?? "ALFA";
  switch (path) {
    case "/equity/price/historical":
    case "/index/price/historical":
    case "/currency/price/historical":
    case "/crypto/price/historical":
      return historical(p);
    case "/equity/price/quote": return quote(sym, p);
    case "/equity/profile": return profile(sym, p);
    case "/equity/fundamental/income": return income(sym, p);
    case "/equity/fundamental/metrics": return metrics(sym, p);
    case "/equity/fundamental/dividends": return dividends(sym, p);
    case "/equity/estimates/consensus": return consensus(sym, p);
    case "/news/company": return news(sym, p);
    case "/equity/discovery/gainers": return movers("gainers", p);
    case "/equity/discovery/losers": return movers("losers", p);
    case "/equity/discovery/active": return movers("active", p);
    case "/derivatives/options/chains": return options(sym, p);
    case "/fixedincome/government/treasury_rates": return treasury(p);
    case "/equity/search": {
      const q = (p.query ?? "").toUpperCase();
      return UNIVERSE.filter((s) => s.includes(q)).slice(0, Number(p.limit ?? 8)).map((s) => ({ symbol: s, name: displayName(s) }));
    }
    case "/equity/screener": return screener(p);
    case "/equity/compare/groups": return groups(p);
    default:
      throw new SyntheticNotAvailable(`${path} is not available in synthetic demo mode`);
  }
}
