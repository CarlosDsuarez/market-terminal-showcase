export type FunctionCode =
  | "CC" | "INTEL" | "HELP" | "PSIM"
  | "PORT" | "TRADE" | "ALGO" | "PERF" | "RISK"
  | "BT" | "CORR" | "COMP" | "SCR" | "WATCH"
  | "DES" | "GP" | "QR" | "HP" | "TECH"
  | "FA" | "KEY" | "DVD" | "EE" | "NI"
  | "WEI" | "MOV" | "OMON"
  | "CURV" | "FXC" | "CRYPTO";

export interface FunctionDef {
  code: FunctionCode;
  name: string;
  needsSymbol: boolean;
  group: "Security" | "Markets" | "Macro" | "System" | "Portfolio" | "Analytics";
  summary: string;
  /**
   * Whether this screen can honestly show a past date. Price history can; the
   * free data layer has no point-in-time fundamentals, analyst targets, news or
   * options, so those screens serve today's data and must say so — see
   * components/LookaheadBanner.tsx.
   */
  pointInTime: boolean;
}

export const FUNCTIONS: FunctionDef[] = [
  { code: "CC",   name: "Command Center",        needsSymbol: false, group: "System", pointInTime: false, summary: "Morning briefing · markets, curve, FX, movers, news" },
  { code: "PSIM", name: "Simulation Console",    needsSymbol: false, group: "System", pointInTime: true,  summary: "Set the as-of date, step time, return to live" },
  { code: "HELP", name: "Function Directory",    needsSymbol: false, group: "System", pointInTime: true,  summary: "List of all terminal functions" },

  { code: "PORT", name: "Portfolio Holdings",    needsSymbol: false, group: "Portfolio", pointInTime: true, summary: "Positions, weights, cost basis and P&L marked to the as-of date" },
  { code: "TRADE", name: "Trade Blotter",        needsSymbol: false, group: "Portfolio", pointInTime: true, summary: "Buy and sell at the as-of close · full trade history" },
  { code: "ALGO", name: "Execution Management",  needsSymbol: false, group: "Portfolio", pointInTime: true, summary: "TWAP, VWAP, POV, Iceberg — one child fill per session at the close" },
  { code: "PERF", name: "Performance",           needsSymbol: false, group: "Portfolio", pointInTime: true, summary: "Equity curve vs benchmark, Sharpe, drawdown, monthly returns" },
  { code: "RISK", name: "Portfolio Risk",        needsSymbol: false, group: "Portfolio", pointInTime: true, summary: "Vol, VaR, beta, drawdown, concentration and risk by position" },

  { code: "BT",   name: "Strategy Backtest",     needsSymbol: false, group: "Analytics", pointInTime: true,  summary: "SMA cross, RSI bands or MACD against buy & hold" },
  { code: "CORR", name: "Correlation Matrix",    needsSymbol: false, group: "Analytics", pointInTime: true,  summary: "Daily-return correlations across holdings and watchlist" },
  { code: "COMP", name: "Peer Comparison",       needsSymbol: false, group: "Analytics", pointInTime: false, summary: "Side-by-side ratios — AAPL,MSFT,NVDA COMP" },
  { code: "SCR",  name: "Screener",              needsSymbol: false, group: "Analytics", pointInTime: false, summary: "US equity screener — filters, signals, views" },
  { code: "WATCH", name: "Watchlist",            needsSymbol: false, group: "Markets",   pointInTime: true,  summary: "Tracked symbols with change, RSI and a technical read" },

  { code: "INTEL", name: "Stock Intelligence",   needsSymbol: true,  group: "Security", pointInTime: false, summary: "Full scorecard — signals across technical, value, fundamentals, analysts" },
  { code: "DES",  name: "Security Description", needsSymbol: true,  group: "Security", pointInTime: false, summary: "Company profile, sector, HQ, employees" },
  { code: "GP",   name: "Graph / Chart",         needsSymbol: true,  group: "Security", pointInTime: true,  summary: "Historical candlestick chart + volume" },
  { code: "TECH", name: "Technical Study",       needsSymbol: true,  group: "Security", pointInTime: true,  summary: "RSI, MACD, Bollinger, ATR, ADX, OBV + interpretation" },
  { code: "QR",   name: "Quote Recap",           needsSymbol: true,  group: "Security", pointInTime: false, summary: "Live quote: last, bid/ask, volume, day range" },
  { code: "HP",   name: "Historical Prices",     needsSymbol: true,  group: "Security", pointInTime: true,  summary: "OHLCV table" },
  { code: "FA",   name: "Financial Analysis",    needsSymbol: true,  group: "Security", pointInTime: false, summary: "Income statement — last 5 fiscal years" },
  { code: "KEY",  name: "Key Ratios & Metrics",  needsSymbol: true,  group: "Security", pointInTime: false, summary: "PE, EV/EBITDA, margins, ROE, etc." },
  { code: "DVD",  name: "Dividend History",      needsSymbol: true,  group: "Security", pointInTime: false, summary: "All historical dividends" },
  { code: "EE",   name: "Analyst Estimates",     needsSymbol: true,  group: "Security", pointInTime: false, summary: "Target prices, recommendation, analyst count" },
  { code: "NI",   name: "News — Company",        needsSymbol: true,  group: "Security", pointInTime: false, summary: "Latest headlines for the symbol" },
  { code: "OMON", name: "Options Monitor",       needsSymbol: true,  group: "Security", pointInTime: false, summary: "Options chain with bid/ask, IV, OI, volume" },

  { code: "WEI",  name: "World Equity Indices",  needsSymbol: false, group: "Markets", pointInTime: true,  summary: "Major global indices — level & daily change" },
  { code: "MOV",  name: "Market Movers",         needsSymbol: false, group: "Markets", pointInTime: false, summary: "US gainers, losers, most active" },
  { code: "CRYPTO", name: "Crypto Monitor",      needsSymbol: false, group: "Markets", pointInTime: true,  summary: "Top crypto prices + sparkline" },
  { code: "FXC",  name: "FX Cross Rates",        needsSymbol: false, group: "Markets", pointInTime: true,  summary: "Major FX pairs matrix" },

  { code: "CURV", name: "US Yield Curve",        needsSymbol: false, group: "Macro", pointInTime: true,  summary: "Treasury par yield curve" },
];

export const FN_BY_CODE: Record<string, FunctionDef> = Object.fromEntries(FUNCTIONS.map((f) => [f.code, f]));

/** Short aliases that open an existing screen. */
export const ALIASES: Record<string, FunctionCode> = { EQS: "SCR" };

function resolveCode(s: string): FunctionCode | undefined {
  if (s in FN_BY_CODE) return s as FunctionCode;
  return ALIASES[s];
}

export interface ParsedCommand {
  symbol?: string;
  code: FunctionCode;
}

/** Parse a free-form command like "AAPL DES", "DES", "AAPL", "TOP". */
export function parseCommand(raw: string, activeSymbol: string | null): ParsedCommand | null {
  const parts = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const p = parts[0];
    const code = resolveCode(p);
    if (code) {
      const fn = FN_BY_CODE[code];
      if (fn.needsSymbol) {
        if (!activeSymbol) return null;
        return { symbol: activeSymbol, code };
      }
      return { code };
    }
    // just a symbol — default to INTEL (the scorecard view)
    return { symbol: p, code: "INTEL" };
  }

  // Multi-token: the code may be first ("COMP AAPL,MSFT") or last
  // ("AAPL,MSFT,NVDA COMP", "AAPL MSFT COMP"). Everything else is symbols.
  // Only BT/CORR/COMP render an optional symbol list — other symbol-less
  // screens (SCR, ALGO, CC, …) ignore it, so drop it to keep the shape stable.
  const OPTIONAL_SYMBOL: ReadonlySet<FunctionCode> = new Set(["BT", "CORR", "COMP"]);
  const first = resolveCode(parts[0]);
  const last = resolveCode(parts[parts.length - 1]);
  const joinSymbols = (toks: string[]) =>
    toks.join(",").replace(/,+/g, ",").replace(/^,|,$/g, "") || undefined;
  const withOptional = (code: FunctionCode, syms: string | undefined): ParsedCommand =>
    syms && OPTIONAL_SYMBOL.has(code) ? { symbol: syms, code } : { code };

  if (last) {
    const syms = joinSymbols(parts.slice(0, -1));
    const fn = FN_BY_CODE[last];
    if (fn.needsSymbol) {
      if (!syms && !activeSymbol) return null;
      return { symbol: syms ?? activeSymbol!, code: last };
    }
    // Code-last keeps the symbol (legacy: "AAPL ALGO" carried it even though
    // ALGO ignores it) — generalized here to N symbols, not just one.
    return syms ? { symbol: syms, code: last } : { code: last };
  }
  if (first) {
    const syms = joinSymbols(parts.slice(1));
    const fn = FN_BY_CODE[first];
    if (fn.needsSymbol) {
      if (!syms && !activeSymbol) return null;
      return { symbol: syms ?? activeSymbol!, code: first };
    }
    return withOptional(first, syms);
  }
  return null;
}
