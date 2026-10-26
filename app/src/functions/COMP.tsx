import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchMetrics, fetchProfile, fetchQuote } from "@/lib/api";
import { fmtPctFromDecimal, fmtPrice, fmtVolume } from "@/lib/format";
import { useWorkspace } from "@/store/workspaceStore";
import { useWatchlist } from "@/store/watchlistStore";
import { cn } from "@/lib/cn";

/** Which end of the range is the good end, if either. */
type Better = "high" | "low" | "none";

interface SymbolData {
  symbol: string;
  quote?: Awaited<ReturnType<typeof fetchQuote>>;
  metrics?: Awaited<ReturnType<typeof fetchMetrics>>;
  profile?: Awaited<ReturnType<typeof fetchProfile>>;
}

interface MetricRow {
  label: string;
  better: Better;
  value: (d: SymbolData) => number | undefined;
  format: (v: number | undefined) => string;
}

const mult = (v: number | undefined) => (v == null ? "—" : `${v.toFixed(1)}x`);
const plain = (v: number | undefined) => (v == null ? "—" : v.toFixed(2));

const ROWS: MetricRow[] = [
  { label: "PRICE", better: "none", value: (d) => d.quote?.last_price, format: (v) => fmtPrice(v) },
  { label: "MARKET CAP", better: "none", value: (d) => d.metrics?.market_cap ?? d.profile?.market_cap, format: (v) => fmtVolume(v) },
  { label: "P/E (TTM)", better: "low", value: (d) => d.metrics?.pe_ratio, format: mult },
  { label: "FWD P/E", better: "low", value: (d) => d.metrics?.forward_pe, format: mult },
  { label: "PEG", better: "low", value: (d) => d.metrics?.peg_ratio, format: plain },
  { label: "EV/EBITDA", better: "low", value: (d) => d.metrics?.enterprise_to_ebitda, format: mult },
  { label: "PRICE/BOOK", better: "low", value: (d) => d.metrics?.price_to_book, format: plain },
  { label: "REV GROWTH", better: "high", value: (d) => d.metrics?.revenue_growth, format: fmtPctFromDecimal },
  { label: "EPS GROWTH", better: "high", value: (d) => d.metrics?.earnings_growth, format: fmtPctFromDecimal },
  { label: "GROSS MARGIN", better: "high", value: (d) => d.metrics?.gross_margin, format: fmtPctFromDecimal },
  { label: "OP MARGIN", better: "high", value: (d) => d.metrics?.operating_margin, format: fmtPctFromDecimal },
  { label: "NET MARGIN", better: "high", value: (d) => d.metrics?.profit_margin, format: fmtPctFromDecimal },
  { label: "ROE", better: "high", value: (d) => d.metrics?.return_on_equity, format: fmtPctFromDecimal },
  { label: "DEBT/EQUITY", better: "low", value: (d) => d.metrics?.debt_to_equity, format: plain },
  { label: "CURRENT RATIO", better: "high", value: (d) => d.metrics?.current_ratio, format: plain },
  { label: "DIV YIELD", better: "high", value: (d) => d.metrics?.dividend_yield, format: fmtPctFromDecimal },
  { label: "PAYOUT", better: "low", value: (d) => d.metrics?.payout_ratio, format: fmtPctFromDecimal },
  { label: "BETA", better: "none", value: (d) => d.profile?.beta, format: plain },
  { label: "52W HIGH", better: "none", value: (d) => d.quote?.year_high, format: (v) => fmtPrice(v) },
  { label: "52W LOW", better: "none", value: (d) => d.quote?.year_low, format: (v) => fmtPrice(v) },
];

const MAX_SYMBOLS = 6;

export function COMP({ symbol }: { symbol?: string }) {
  const openTab = useWorkspace((s) => s.openTab);
  const watched = useWatchlist((s) => s.symbols);

  const symbols = useMemo(() => {
    const raw = symbol
      ? symbol.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : watched;
    return [...new Set(raw)].slice(0, MAX_SYMBOLS);
  }, [symbol, watched]);

  // Three endpoints per symbol, capped at six symbols — bounded enough to fan
  // out rather than serialise. Keys match the other screens, so a symbol already
  // opened in INTEL costs nothing here.
  const queries = useQueries({
    queries: symbols.flatMap((s) => [
      { queryKey: ["quote", s], queryFn: () => fetchQuote(s), staleTime: 30_000 },
      { queryKey: ["metrics", s], queryFn: () => fetchMetrics(s), staleTime: 60_000 },
      { queryKey: ["profile", s], queryFn: () => fetchProfile(s), staleTime: 60_000 },
    ]),
  });

  const data: SymbolData[] = symbols.map((s, i) => ({
    symbol: s,
    quote: queries[i * 3]?.data,
    metrics: queries[i * 3 + 1]?.data,
    profile: queries[i * 3 + 2]?.data,
  }));

  const loading = queries.some((q) => q.isLoading);

  if (symbols.length === 0) {
    return (
      <div className="p-6 text-[12px] text-term-muted">
        Nothing to compare. Run <span className="num text-term-amber">AAPL,MSFT,NVDA COMP</span>,
        or fill the <span className="num text-term-amber">WATCH</span> list.
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-term-border pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] text-term-amber font-bold tracking-wider">PEER COMPARISON</span>
          <span className="sub-header">{symbols.length} symbols{loading ? " · loading…" : ""}</span>
        </div>
        <div className="sub-header">
          <span className="text-term-heading font-bold underline decoration-dotted underline-offset-2">underlined</span>
          {" "}= best in row · <span className="text-term-muted">dimmed</span> = worst
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>SIDE BY SIDE</span></div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Metric</th>
                {data.map((d) => (
                  <th key={d.symbol} className="text-right">
                    <button onClick={() => openTab("INTEL", d.symbol)} className="num text-term-amber hover:underline">
                      {d.symbol}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const vals = data.map((d) => row.value(d));
                const present = vals.filter((v): v is number => v != null && Number.isFinite(v));
                // Rank only when more than one peer reported the metric, and only
                // where high or low genuinely means better.
                const rankable = row.better !== "none" && present.length > 1;
                const best = rankable ? (row.better === "high" ? Math.max(...present) : Math.min(...present)) : undefined;
                const worst = rankable ? (row.better === "high" ? Math.min(...present) : Math.max(...present)) : undefined;
                return (
                  <tr key={row.label}>
                    <td className="sub-header">{row.label}</td>
                    {vals.map((v, i) => (
                      <td key={data[i].symbol}
                        className={cn("num text-right",
                          v == null ? "text-term-muted"
                            : best != null && v === best ? "text-term-heading font-bold underline decoration-dotted underline-offset-2"
                            : worst != null && v === worst ? "text-term-muted"
                            : "text-term-text")}>
                        {row.format(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>PROFILE</span></div>
        <div className="overflow-auto scroll-thin">
          <table className="w-full grid-data">
            <tbody>
              <tr>
                <td className="sub-header">NAME</td>
                {data.map((d) => <td key={d.symbol} className="text-term-heading">{d.profile?.name ?? "—"}</td>)}
              </tr>
              <tr>
                <td className="sub-header">SECTOR</td>
                {data.map((d) => <td key={d.symbol}>{d.profile?.sector ?? "—"}</td>)}
              </tr>
              <tr>
                <td className="sub-header">INDUSTRY</td>
                {data.map((d) => <td key={d.symbol}>{d.profile?.industry_category ?? "—"}</td>)}
              </tr>
              <tr>
                <td className="sub-header">EMPLOYEES</td>
                {data.map((d) => (
                  <td key={d.symbol} className="num">
                    {d.profile?.employees == null ? "—" : d.profile.employees.toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        <button onClick={() => openTab("CORR", symbols.join(","))}
          className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
          CORR <span className="text-term-muted normal-case">· Correlations</span>
        </button>
        <button onClick={() => openTab("WATCH")}
          className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
          WATCH <span className="text-term-muted normal-case">· Watchlist</span>
        </button>
      </div>
    </div>
  );
}
