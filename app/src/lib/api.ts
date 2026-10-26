import { anchorDate, getAsOf, toIso } from "./asOf";
import { IS_SYNTHETIC } from "./dataMode";
import { SyntheticNotAvailable, syntheticGet } from "./synthetic";
import type { ScreenerRequest } from "./screener/query";
import { normalizeScreenerSymbols, type ScreenerRow } from "./screener/query";

const BASE = "/api/v1";

/**
 * Endpoints that accept an `end_date`. OpenBB validates query parameters, so
 * sending `end_date` to an endpoint that does not declare it answers 422 — the
 * simulation clamp has to be opt-in per path rather than blanket.
 */
const TIME_BOUNDED = [
  "/equity/price/historical",
  "/index/price/historical",
  "/currency/price/historical",
  "/crypto/price/historical",
  "/fixedincome/government/treasury_rates",
];

export class ApiError extends Error {
  constructor(public status: number, message: string, public needsKey?: string) {
    super(message);
  }
}

async function get<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  // Clamp historical requests to the simulation date, unless the caller already
  // chose its own window — the portfolio engine asks for explicit ranges.
  const asOf = getAsOf();
  if (asOf && !qs.has("end_date") && TIME_BOUNDED.some((p) => path.startsWith(p))) {
    qs.set("end_date", asOf);
  }

  if (IS_SYNTHETIC) {
    // Offline demo: answer from the seeded generator instead of OpenBB.
    try {
      return syntheticGet(path, Object.fromEntries(qs)) as T;
    } catch (e) {
      if (e instanceof SyntheticNotAvailable) throw new ApiError(404, e.message);
      throw e;
    }
  }

  const res = await fetch(`${BASE}${path}?${qs.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.detail;
    let msg = res.statusText;
    let needsKey: string | undefined;
    if (typeof detail === "string") msg = detail;
    else if (Array.isArray(detail)) {
      msg = detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d ? String(d.msg) : JSON.stringify(d)
        )
        .join("; ");
    }
    const m = /credential '([a-z_]+)'/i.exec(msg);
    if (m) needsKey = m[1];
    throw new ApiError(res.status, msg, needsKey);
  }
  return body.results as T;
}

// ────── Equity ──────
export interface Quote {
  symbol: string; name?: string; exchange?: string;
  last_price?: number; open?: number; high?: number; low?: number; prev_close?: number;
  bid?: number; ask?: number; bid_size?: number; ask_size?: number;
  volume?: number; volume_average?: number; year_high?: number; year_low?: number;
  ma_50d?: number; ma_200d?: number; currency?: string;
}
export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number; }
export interface NewsItem { id: string; date: string; title: string; url: string; source?: string; summary?: string; symbol?: string; }
export interface Profile {
  symbol: string; name?: string; stock_exchange?: string; long_description?: string;
  company_url?: string; business_phone_no?: string;
  hq_address1?: string; hq_address_city?: string; hq_state?: string; hq_country?: string; hq_address_postal_code?: string;
  employees?: number; sector?: string; industry_category?: string; issue_type?: string; currency?: string;
  market_cap?: number; shares_outstanding?: number; shares_float?: number;
  dividend_yield?: number; beta?: number;
}
export interface IncomeRow {
  period_ending: string;
  total_revenue?: number; cost_of_revenue?: number; gross_profit?: number;
  operating_income?: number; total_pre_tax_income?: number; net_income?: number;
  basic_earnings_per_share?: number; diluted_earnings_per_share?: number;
  research_and_development_expense?: number; selling_general_and_admin_expense?: number;
}
export interface Metrics {
  symbol: string; market_cap?: number; pe_ratio?: number; forward_pe?: number; peg_ratio?: number;
  enterprise_to_ebitda?: number; revenue_growth?: number; earnings_growth?: number;
  quick_ratio?: number; current_ratio?: number; debt_to_equity?: number;
  gross_margin?: number; operating_margin?: number; profit_margin?: number;
  return_on_assets?: number; return_on_equity?: number;
  dividend_yield?: number; payout_ratio?: number; book_value?: number; price_to_book?: number;
  enterprise_value?: number;
}
export interface Dividend { ex_dividend_date: string; amount: number; }
export interface ConsensusEstimate {
  symbol: string; target_high?: number; target_low?: number; target_consensus?: number;
  target_median?: number; recommendation?: string; recommendation_mean?: number;
  number_of_analysts?: number; current_price?: number; currency?: string;
}
export interface Mover {
  symbol: string; name?: string; price: number; change: number; percent_change: number;
  volume: number; market_cap?: number; pe_forward?: number; eps_ttm?: number;
  dividend_yield?: number; exchange?: string; earnings_date?: string;
}
export interface SearchResult { symbol: string; name: string; cik?: string; }
export interface OptionsRow {
  underlying_symbol: string; underlying_price?: number; contract_symbol: string;
  expiration: string; dte: number; strike: number; option_type: "call" | "put";
  open_interest?: number; volume?: number; last_trade_price?: number;
  bid?: number; ask?: number; change?: number; change_percent?: number;
  implied_volatility?: number; in_the_money?: boolean;
}
export interface TreasuryRow {
  date: string; month_1?: number; month_3?: number; month_6?: number;
  year_1?: number; year_2?: number; year_3?: number; year_5?: number; year_7?: number;
  year_10?: number; year_20?: number; year_30?: number;
}

// Fetchers
export const fetchQuote = (s: string) =>
  get<Quote[] | Quote>("/equity/price/quote", { symbol: s, provider: "yfinance" })
    .then((r) => (Array.isArray(r) ? r[0] : r));

/**
 * Drop bars the provider has not settled yet.
 *
 * yfinance returns the session in progress as a row whose close is null. That
 * reads downstream as a missing price: the Command Center rendered every index
 * as "—" at -100%, because it takes the last row's close and compares it to the
 * one before. A bar without a close is not a bar.
 */
const settled = <T extends { close: number }>(rows: T[] | null | undefined): T[] =>
  (rows ?? []).filter((c) => c.close != null && Number.isFinite(c.close));

export const fetchHistorical = (
  s: string,
  o: { interval?: string; start_date?: string; end_date?: string } = {}
) =>
  get<Candle[]>("/equity/price/historical", {
    symbol: s,
    provider: "yfinance",
    interval: o.interval ?? "1d",
    start_date: o.start_date ?? isoDaysAgo(400),
    end_date: o.end_date,
  }).then(settled);

export const fetchNewsCompany = (s: string, limit = 30) =>
  get<NewsItem[]>("/news/company", { symbol: s, provider: "yfinance", limit });

/**
 * yfinance reports `dividendYield` already in percent (VZ = 6.05) even though
 * OpenBB's schema documents it as a normalized decimal. Rescale it here so the
 * rest of the app can treat every ratio field as a decimal. `payout_ratio` is
 * genuinely decimal and must not be touched.
 */
function normalizeDividendYield<T extends { dividend_yield?: number }>(row: T): T {
  if (!row || row.dividend_yield == null) return row;
  return { ...row, dividend_yield: row.dividend_yield / 100 };
}

export const fetchProfile = (s: string) =>
  get<Profile[] | Profile>("/equity/profile", { symbol: s, provider: "yfinance" })
    .then((r) => normalizeDividendYield(Array.isArray(r) ? r[0] : r));

export const fetchIncome = (s: string) =>
  get<IncomeRow[]>("/equity/fundamental/income", {
    symbol: s, provider: "yfinance", period: "annual", limit: 5,
  });

export const fetchMetrics = (s: string) =>
  get<Metrics[] | Metrics>("/equity/fundamental/metrics", { symbol: s, provider: "yfinance" })
    .then((r) => normalizeDividendYield(Array.isArray(r) ? r[0] : r));

export const fetchDividends = (s: string) =>
  get<Dividend[]>("/equity/fundamental/dividends", { symbol: s, provider: "yfinance" });

export const fetchConsensus = (s: string) =>
  get<ConsensusEstimate[] | ConsensusEstimate>("/equity/estimates/consensus", {
    symbol: s, provider: "yfinance",
  }).then((r) => (Array.isArray(r) ? r[0] : r));

export const fetchGainers = () =>
  get<Mover[]>("/equity/discovery/gainers", { provider: "yfinance" });
export const fetchLosers = () =>
  get<Mover[]>("/equity/discovery/losers", { provider: "yfinance" });
export const fetchMostActive = () =>
  get<Mover[]>("/equity/discovery/active", { provider: "yfinance" });

export const fetchOptions = (s: string) =>
  get<OptionsRow[]>("/derivatives/options/chains", { symbol: s, provider: "yfinance" });

/**
 * `days` before the terminal's anchor — today when live, the simulation date
 * when not. Every range-based panel resolves its window through here, so moving
 * the clock moves all of them without touching a single call site.
 */
export const isoDaysAgo = (days: number) => {
  const d = anchorDate();
  d.setDate(d.getDate() - days);
  return toIso(d);
};

export interface SymbolCandle extends Candle { symbol: string; }

/**
 * OpenBB accepts comma-separated symbols and answers with a single flat array
 * tagged by `symbol`, so a panel listing N tickers costs one request instead of
 * N — which also keeps yfinance from rate-limiting a 60s refresh loop.
 *
 * Row order is not guaranteed, so each series is sorted by date: callers read
 * the last two entries as the latest and previous session.
 */
async function fetchHistoricalBatch(
  path: string,
  symbols: string[],
  days: number,
  o: { start_date?: string; end_date?: string } = {}
): Promise<Record<string, Candle[]>> {
  if (symbols.length === 0) return {};
  const rows = await get<SymbolCandle[]>(path, {
    symbol: symbols.join(","),
    provider: "yfinance",
    interval: "1d",
    start_date: o.start_date ?? isoDaysAgo(days),
    end_date: o.end_date,
  });
  const bySymbol: Record<string, Candle[]> = {};
  for (const s of symbols) bySymbol[s] = [];
  for (const row of settled(rows)) {
    // A single-symbol request answers without a `symbol` field on each row, so
    // there is nothing to bucket by — attribute those rows to the only symbol
    // that could have produced them. Without this a one-holding portfolio gets
    // an empty price series and marks its position at cost forever.
    const key = row.symbol ?? (symbols.length === 1 ? symbols[0] : undefined);
    if (key == null) continue;
    (bySymbol[key] ??= []).push(row);
  }
  for (const series of Object.values(bySymbol)) {
    series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return bySymbol;
}

/**
 * One request for a whole book of holdings. The portfolio engine passes an
 * explicit window rather than a day count, because a portfolio's history starts
 * at its inception date, not a fixed number of days back.
 */
export const fetchEquityHistoricalBatch = (
  symbols: string[],
  o: { start_date?: string; end_date?: string; days?: number } = {}
) => fetchHistoricalBatch("/equity/price/historical", symbols, o.days ?? 400, o);

export const fetchIndexHistoricalBatch = (symbols: string[], days = 30, end_date?: string) =>
  fetchHistoricalBatch("/index/price/historical", symbols, days, { end_date });

export const fetchCryptoHistoricalBatch = (symbols: string[], days = 30, end_date?: string) =>
  fetchHistoricalBatch("/crypto/price/historical", symbols, days, { end_date });

export const fetchFxHistoricalBatch = (symbols: string[], days = 30, end_date?: string) =>
  fetchHistoricalBatch("/currency/price/historical", symbols, days, { end_date });

export const fetchIndexHistorical = (s: string, days = 30, end_date?: string) =>
  get<Candle[]>("/index/price/historical", {
    symbol: s, provider: "yfinance", interval: "1d", start_date: isoDaysAgo(days), end_date,
  }).then(settled);

export const fetchTreasuryRates = (days = 30, end_date?: string) =>
  get<TreasuryRow[]>("/fixedincome/government/treasury_rates", {
    provider: "federal_reserve", start_date: isoDaysAgo(days), end_date,
  });

export const fetchFxHistorical = (pair: string, days = 30, end_date?: string) =>
  get<Candle[]>("/currency/price/historical", {
    symbol: pair, provider: "yfinance", interval: "1d", start_date: isoDaysAgo(days), end_date,
  }).then(settled);

export const fetchCryptoHistorical = (sym: string, days = 30, end_date?: string) =>
  get<Candle[]>("/crypto/price/historical", {
    symbol: sym, provider: "yfinance", interval: "1d", start_date: isoDaysAgo(days), end_date,
  }).then(settled);

export const searchSymbols = (q: string, limit = 8) =>
  get<SearchResult[]>("/equity/search", { query: q, provider: "sec", limit, is_symbol: false });

// ────── Screener (OpenBB finviz) ──────
export type { ScreenerRow };

export const fetchScreener = async (req: ScreenerRequest): Promise<ScreenerRow[]> => {
  const rows = await get<ScreenerRow[] | ScreenerRow>("/equity/screener", {
    provider: "finviz",
    metric: req.metric,
    signal: req.signal,
    // Wrap JSON so FastAPI keeps filters_dict as a string query param
    // (a bare `{...}` is parsed as an object and 422s).
    filters_dict: req.filters_dict != null ? JSON.stringify(req.filters_dict) : undefined,
    limit: req.limit,
  });
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return normalizeScreenerSymbols(list);
};

export type GroupMetric = "performance" | "valuation" | "overview";
export type GroupBy =
  | "sector" | "industry" | "country" | "capitalization"
  | "energy" | "materials" | "industrials" | "consumer_cyclical" | "consumer_defensive"
  | "healthcare" | "financial" | "technology" | "communication_services" | "utilities" | "real_estate";

export interface GroupRow {
  name: string;
  stocks?: number;
  market_cap?: number;
  performance_1d?: number;
  performance_1w?: number;
  performance_1m?: number;
  performance_3m?: number;
  performance_6m?: number;
  performance_1y?: number;
  performance_ytd?: number;
  dividend_yield?: number;
  pe?: number;
  forward_pe?: number;
  peg?: number;
  volume?: number;
  volume_average?: number;
  volume_relative?: number;
  [k: string]: unknown;
}

export const fetchCompareGroups = (group: GroupBy, metric: GroupMetric) =>
  get<GroupRow[]>("/equity/compare/groups", { provider: "finviz", group, metric });
