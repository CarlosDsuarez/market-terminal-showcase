import raw from "./screenerCatalog.json";

export type FilterCategory = "descriptive" | "fundamental" | "technical";
export type ScreenerMetric =
  | "overview"
  | "valuation"
  | "financial"
  | "ownership"
  | "performance"
  | "technical";

export type ColumnFormat =
  | "text"
  | "price"
  | "pctDec"
  | "vol"
  | "ratio"
  | "int"
  | "rsi"
  | "date"
  | "beta";

export interface SignalDef {
  id: string;
  label: string;
  description: string;
}

export interface FilterDef {
  key: string;
  label: string;
  category: FilterCategory;
  options: string[];
  custom: boolean;
}

export interface ColumnDef {
  id: string;
  label: string;
  keys?: string[];
  format: ColumnFormat;
  signed?: boolean;
  metric: ScreenerMetric;
}

interface RawCatalog {
  signals: SignalDef[];
  filters: Record<string, string[]>;
}

const DATA = raw as RawCatalog;

const DESCRIPTIVE = new Set([
  "Exchange", "Index", "Sector", "Industry", "Country", "Market Cap.",
  "Earnings Date", "IPO Date", "Shares Outstanding", "Float", "Option/Short",
  "Price", "Average Volume", "Relative Volume", "Current Volume", "Target Price",
]);

const TECHNICAL = new Set([
  "Performance", "Performance 2", "Volatility", "RSI (14)", "Gap",
  "20-Day Simple Moving Average", "50-Day Simple Moving Average", "200-Day Simple Moving Average",
  "Change", "Change from Open", "20-Day High/Low", "50-Day High/Low", "52-Week High/Low",
  "Pattern", "Candlestick", "Beta", "Average True Range",
]);

function prettyLabel(key: string): string {
  return key
    .replace("EPS growththis year", "EPS growth this year")
    .replace("EPS growthnext year", "EPS growth next year")
    .replace("EPS growthpast 5 years", "EPS growth past 5 years")
    .replace("EPS growthnext 5 years", "EPS growth next 5 years")
    .replace("EPS growthqtr over qtr", "EPS growth qtr over qtr")
    .replace("Sales growthpast 5 years", "Sales growth past 5 years")
    .replace("Sales growthqtr over qtr", "Sales growth qtr over qtr")
    .replace("InsiderOwnership", "Insider Ownership")
    .replace("InsiderTransactions", "Insider Transactions")
    .replace("InstitutionalOwnership", "Institutional Ownership")
    .replace("InstitutionalTransactions", "Institutional Transactions");
}

const CUSTOM_RE = /\b(Under|Over|to)\b|Low \(<|>\)|High \(>/i;

export const SIGNALS: SignalDef[] = DATA.signals;

export const FILTERS: FilterDef[] = Object.entries(DATA.filters).map(([key, options]) => ({
  key,
  label: prettyLabel(key),
  category: DESCRIPTIVE.has(key) ? "descriptive" : TECHNICAL.has(key) ? "technical" : "fundamental",
  options,
  custom: options.some((o) => CUSTOM_RE.test(o)),
}));

const BY_KEY = new Map(FILTERS.map((f) => [f.key, f]));

export function filterByKey(key: string): FilterDef | undefined {
  return BY_KEY.get(key);
}

const col = (
  id: string,
  label: string,
  metric: ScreenerMetric,
  format: ColumnFormat,
  extra?: Partial<ColumnDef>,
): ColumnDef => ({ id, label, format, metric, ...extra });

export const VIEW_COLUMNS: Record<ScreenerMetric, ColumnDef[]> = {
  overview: [
    col("symbol", "Ticker", "overview", "text"),
    col("name", "Company", "overview", "text"),
    col("sector", "Sector", "overview", "text"),
    col("industry", "Industry", "overview", "text"),
    col("country", "Country", "overview", "text"),
    col("market_cap", "Mkt Cap", "overview", "vol"),
    col("price_to_earnings", "P/E", "overview", "ratio"),
    col("price", "Price", "overview", "price"),
    col("change_percent", "Change", "overview", "pctDec", { keys: ["Change %"], signed: true }),
    col("volume", "Volume", "overview", "vol"),
  ],
  valuation: [
    col("symbol", "Ticker", "valuation", "text"),
    col("market_cap", "Mkt Cap", "valuation", "vol"),
    col("price_to_earnings", "P/E", "valuation", "ratio"),
    col("forward_pe", "Fwd P/E", "valuation", "ratio"),
    col("peg_ratio", "PEG", "valuation", "ratio"),
    col("price_to_sales", "P/S", "valuation", "ratio"),
    col("price_to_book", "P/B", "valuation", "ratio"),
    col("price_to_cash", "P/C", "valuation", "ratio"),
    col("price_to_fcf", "P/FCF", "valuation", "ratio", { keys: ["price_to_free_cash_flow"] }),
    col("eps_growth_past_5y", "EPS 5Y", "valuation", "pctDec", { signed: true }),
    col("eps_growth_next_5y", "EPS N5Y", "valuation", "pctDec", { signed: true }),
    col("sales_growth_past_5y", "Sales 5Y", "valuation", "pctDec", { signed: true }),
    col("price", "Price", "valuation", "price"),
    col("change_percent", "Change", "valuation", "pctDec", { keys: ["Change %"], signed: true }),
    col("volume", "Volume", "valuation", "vol"),
  ],
  financial: [
    col("symbol", "Ticker", "financial", "text"),
    col("market_cap", "Mkt Cap", "financial", "vol"),
    col("dividend_yield", "Div Yield", "financial", "pctDec"),
    col("return_on_assets", "ROA", "financial", "pctDec", { signed: true }),
    col("return_on_equity", "ROE", "financial", "pctDec", { signed: true }),
    col("return_on_investment", "ROI", "financial", "pctDec", { keys: ["ROIC"], signed: true }),
    col("current_ratio", "Curr R", "financial", "ratio"),
    col("quick_ratio", "Quick R", "financial", "ratio"),
    col("long_term_debt_to_equity", "LT D/E", "financial", "ratio"),
    col("debt_to_equity", "D/E", "financial", "ratio"),
    col("gross_margin", "Gross M", "financial", "pctDec", { signed: true }),
    col("operating_margin", "Oper M", "financial", "pctDec", { signed: true }),
    col("profit_margin", "Profit M", "financial", "pctDec", { signed: true }),
    col("earnings_date", "Earnings", "financial", "date"),
    col("price", "Price", "financial", "price"),
    col("change_percent", "Change", "financial", "pctDec", { keys: ["Change %"], signed: true }),
  ],
  ownership: [
    col("symbol", "Ticker", "ownership", "text"),
    col("market_cap", "Mkt Cap", "ownership", "vol"),
    col("shares_outstanding", "Outstanding", "ownership", "vol"),
    col("shares_float", "Float", "ownership", "vol"),
    col("insider_ownership", "Insider Own", "ownership", "pctDec"),
    col("insider_ownership_change", "Insider Trans", "ownership", "pctDec", { signed: true }),
    col("institutional_ownership", "Inst Own", "ownership", "pctDec"),
    col("institutional_ownership_change", "Inst Trans", "ownership", "pctDec", { signed: true }),
    col("short_interest", "Short Float", "ownership", "pctDec", { keys: ["Short Float"] }),
    col("short_ratio", "Short Ratio", "ownership", "ratio"),
    col("volume_avg", "Avg Vol", "ownership", "vol"),
    col("price", "Price", "ownership", "price"),
    col("change_percent", "Change", "ownership", "pctDec", { keys: ["Change %"], signed: true }),
  ],
  performance: [
    col("symbol", "Ticker", "performance", "text"),
    col("price_change_1w", "Week", "performance", "pctDec", { signed: true }),
    col("price_change_1m", "Month", "performance", "pctDec", { signed: true }),
    col("price_change_3m", "Quart", "performance", "pctDec", { signed: true }),
    col("price_change_6m", "Half", "performance", "pctDec", { signed: true }),
    col("price_change_1y", "Year", "performance", "pctDec", { signed: true }),
    col("price_change_ytd", "YTD", "performance", "pctDec", { signed: true }),
    col("volatility_1w", "Vol W", "performance", "pctDec"),
    col("volatility_1m", "Vol M", "performance", "pctDec"),
    col("volume", "Volume", "performance", "vol"),
    col("volume_avg", "Avg Vol", "performance", "vol"),
    col("volume_relative", "Rel Vol", "performance", "ratio"),
    col("price", "Price", "performance", "price"),
    col("change_percent", "Change", "performance", "pctDec", { keys: ["Change %"], signed: true }),
  ],
  technical: [
    col("symbol", "Ticker", "technical", "text"),
    col("beta", "Beta", "technical", "beta"),
    col("average_true_range", "ATR", "technical", "price"),
    col("sma20_percent", "SMA20", "technical", "pctDec", { signed: true }),
    col("sma50_percent", "SMA50", "technical", "pctDec", { signed: true }),
    col("sma200_percent", "SMA200", "technical", "pctDec", { signed: true }),
    col("year_high_percent", "52W High", "technical", "pctDec", { signed: true }),
    col("year_low_percent", "52W Low", "technical", "pctDec", { signed: true }),
    col("rsi", "RSI", "technical", "rsi"),
    col("gap", "Gap", "technical", "pctDec", { signed: true }),
    col("change_from_open", "From Open", "technical", "pctDec", { keys: ["Change from Open %"], signed: true }),
    col("price", "Price", "technical", "price"),
    col("change_percent", "Change", "technical", "pctDec", { keys: ["Change %"], signed: true }),
    col("volume", "Volume", "technical", "vol"),
  ],
};

const METRIC_FOR_COL = new Map<string, ScreenerMetric>();
for (const [metric, cols] of Object.entries(VIEW_COLUMNS) as [ScreenerMetric, ColumnDef[]][]) {
  for (const c of cols) {
    if (!METRIC_FOR_COL.has(c.id)) METRIC_FOR_COL.set(c.id, metric);
  }
}

export function metricForColumn(id: string): ScreenerMetric | undefined {
  return METRIC_FOR_COL.get(id);
}

/** Deduped union used by the Custom column picker, ticker first. */
export const ALL_COLUMNS: ColumnDef[] = (() => {
  const seen = new Set<string>();
  const out: ColumnDef[] = [];
  for (const cols of Object.values(VIEW_COLUMNS)) {
    for (const c of cols) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
})();

export const DEFAULT_CUSTOM_COLUMNS = [
  "symbol", "name", "sector", "market_cap", "price_to_earnings", "peg_ratio",
  "rsi", "sma200_percent", "price", "change_percent", "volume",
];

export const PAGE_SIZES = [20, 50, 100] as const;
export const FETCH_LIMITS = [100, 250, 500, 1000] as const;
export const DEFAULT_FETCH_LIMIT = 250;

/** Maps a Finviz filter key to the row field used for client-side custom ranges. */
export interface FilterFieldMap {
  keys: string[];
  /** Multiply the user's min/max by this before comparing to the row. */
  scale: number;
}

export const FILTER_FIELDS: Record<string, FilterFieldMap> = {
  "P/E": { keys: ["price_to_earnings"], scale: 1 },
  "Forward P/E": { keys: ["forward_pe"], scale: 1 },
  PEG: { keys: ["peg_ratio"], scale: 1 },
  "P/S": { keys: ["price_to_sales"], scale: 1 },
  "P/B": { keys: ["price_to_book"], scale: 1 },
  "Price/Cash": { keys: ["price_to_cash"], scale: 1 },
  "Price/Free Cash Flow": { keys: ["price_to_fcf", "price_to_free_cash_flow"], scale: 1 },
  Price: { keys: ["price"], scale: 1 },
  "RSI (14)": { keys: ["rsi"], scale: 1 },
  Beta: { keys: ["beta"], scale: 1 },
  "Average True Range": { keys: ["average_true_range"], scale: 1 },
  "Market Cap.": { keys: ["market_cap"], scale: 1e9 },
  "Dividend Yield": { keys: ["dividend_yield"], scale: 0.01 },
  "Payout Ratio": { keys: ["payout_ratio"], scale: 0.01 },
  "Return on Assets": { keys: ["return_on_assets"], scale: 0.01 },
  "Return on Equity": { keys: ["return_on_equity"], scale: 0.01 },
  "Return on Investment": { keys: ["return_on_investment", "ROIC"], scale: 0.01 },
  "Current Ratio": { keys: ["current_ratio"], scale: 1 },
  "Quick Ratio": { keys: ["quick_ratio"], scale: 1 },
  "LT Debt/Equity": { keys: ["long_term_debt_to_equity"], scale: 1 },
  "Debt/Equity": { keys: ["debt_to_equity"], scale: 1 },
  "Gross Margin": { keys: ["gross_margin"], scale: 0.01 },
  "Operating Margin": { keys: ["operating_margin"], scale: 0.01 },
  "Net Profit Margin": { keys: ["profit_margin"], scale: 0.01 },
  "Average Volume": { keys: ["volume_avg"], scale: 1 },
  "Current Volume": { keys: ["volume"], scale: 1 },
  "Relative Volume": { keys: ["volume_relative"], scale: 1 },
  "Float Short": { keys: ["short_interest", "Short Float"], scale: 0.01 },
  "InsiderOwnership": { keys: ["insider_ownership"], scale: 0.01 },
  "InstitutionalOwnership": { keys: ["institutional_ownership"], scale: 0.01 },
  "Shares Outstanding": { keys: ["shares_outstanding"], scale: 1e6 },
  Float: { keys: ["shares_float"], scale: 1e6 },
};
