import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchQuote, fetchProfile, fetchMetrics, fetchConsensus,
  fetchNewsCompany, fetchIncome, fetchHistorical, isoDaysAgo, searchSymbols,
} from "@/lib/api";
import { fmtPrice, fmtPct, fmtVolume, fmtTime, fmtPctFromDecimal } from "@/lib/format";
import { snapshot } from "@/lib/indicators";
import {
  sigMA, sig52w, sigPE, sigFwdPE, sigEvEbitda, sigMargin, sigGrowth,
  sigAnalystUpside, sigAnalystRec, sigDebtEquity, sigDividend, tally,
  sigRSI, sigMACD, sigCross, sigADX, type Signal,
} from "@/lib/signals";
import { KV, SignalGroup, SignalRow } from "@/components/Signals";
import { useWorkspace } from "@/store/workspaceStore";
import { useSim } from "@/store/simStore";
import { todayIso } from "@/lib/asOf";
import { cn } from "@/lib/cn";

export function INTEL({ symbol }: { symbol: string }) {
  const openTab = useWorkspace((s) => s.openTab);
  const asOf = useSim((s) => s.asOf) ?? todayIso();

  const [quoteQ, profileQ, metricsQ, consensusQ, newsQ, incomeQ, histQ] = useQueries({
    queries: [
      { queryKey: ["quote", symbol], queryFn: () => fetchQuote(symbol), refetchInterval: 5000 },
      { queryKey: ["profile", symbol], queryFn: () => fetchProfile(symbol) },
      { queryKey: ["metrics", symbol], queryFn: () => fetchMetrics(symbol) },
      { queryKey: ["consensus", symbol], queryFn: () => fetchConsensus(symbol) },
      { queryKey: ["news", symbol], queryFn: () => fetchNewsCompany(symbol, 5) },
      { queryKey: ["income", symbol], queryFn: () => fetchIncome(symbol) },
      {
        queryKey: ["tech-historical", symbol, 730, asOf],
        queryFn: () => fetchHistorical(symbol, { start_date: isoDaysAgo(730), end_date: asOf }),
        staleTime: 60_000,
      },
    ],
  });

  const q = quoteQ.data;
  const p = profileQ.data;
  const m = metricsQ.data;
  const e = consensusQ.data;
  const news = newsQ.data ?? [];
  const chg = q?.last_price != null && q?.prev_close != null ? q.last_price - q.prev_close : undefined;
  const chgPct = q?.last_price != null && q?.prev_close != null ? ((q.last_price - q.prev_close) / q.prev_close) * 100 : undefined;
  const dir = chg == null ? "flat" : chg >= 0 ? "up" : "down";

  // 5-year revenue sparkline
  const revSeries = useMemo(() => {
    const income = incomeQ.data ?? [];
    const sorted = [...income].sort((a, b) => (a.period_ending > b.period_ending ? 1 : -1));
    return sorted.map((r) => r.total_revenue ?? 0);
  }, [incomeQ.data]);

  // Indicators computed from the daily bars, not from the quote's precomputed
  // averages — that is what makes RSI/MACD/ADX available here at all.
  const tech = useMemo(() => snapshot(histQ.data ?? []), [histQ.data]);

  // Compute signals
  const technicals: Signal[] = [
    sigMA(q?.last_price, q?.ma_50d, "50d MA"),
    sigMA(q?.last_price, q?.ma_200d, "200d MA"),
    sig52w(q?.last_price, q?.year_high, q?.year_low),
    sigRSI(tech.rsi14),
    sigMACD(tech.macd, tech.macdSignal, tech.prevMacd, tech.prevMacdSignal),
    sigCross(tech.sma50, tech.sma200, tech.prevSma50, tech.prevSma200),
    sigADX(tech.adx14, tech.plusDI, tech.minusDI),
  ];
  const valuation: Signal[] = [
    sigPE(m?.pe_ratio),
    sigFwdPE(m?.forward_pe, m?.pe_ratio),
    sigEvEbitda(m?.enterprise_to_ebitda),
  ];
  const fundamentals: Signal[] = [
    sigGrowth(m?.revenue_growth, "Revenue"),
    sigGrowth(m?.earnings_growth, "Earnings"),
    sigMargin(m?.operating_margin, "op"),
    sigMargin(m?.gross_margin, "gross"),
    sigDebtEquity(m?.debt_to_equity),
  ];
  const analyst: Signal[] = [
    sigAnalystRec(e?.recommendation, e?.recommendation_mean),
    sigAnalystUpside(e?.current_price ?? q?.last_price, e?.target_consensus),
  ];
  const shareholder: Signal[] = [
    sigDividend(m?.dividend_yield, m?.payout_ratio),
  ];

  const allSignals = [...technicals, ...valuation, ...fundamentals, ...analyst, ...shareholder];
  const t = tally(allSignals);

  const loading = quoteQ.isLoading || profileQ.isLoading || metricsQ.isLoading;
  if (loading) return <div className="p-6 text-term-muted uppercase text-[11px] tracking-widest">Loading intelligence for {symbol}…</div>;

  // Failed fetches used to look identical to an empty ticker ("NO DATA"), which
  // made a down OpenBB API look like Yahoo had never heard of TSLA.
  const transportFailed =
    quoteQ.isError && profileQ.isError && metricsQ.isError;
  if (transportFailed) {
    const detail = [quoteQ.error, profileQ.error, metricsQ.error]
      .find((e): e is Error => e instanceof Error)?.message;
    return (
      <div className="p-8 flex flex-col gap-3 max-w-2xl text-[12px]">
        <div className="text-term-red text-[11px] uppercase tracking-[0.3em] font-bold">API UNREACHABLE</div>
        <div className="text-term-heading text-xl">
          Could not load <span className="text-term-amber font-bold num">{symbol}</span>.
        </div>
        <div className="text-term-text leading-relaxed">
          The OpenBB API on <span className="num">:6900</span> did not respond.
          From the project folder run <code className="text-term-amberBright mx-1">./start.sh</code>
          (or <code className="text-term-amberBright mx-1">./stop.sh && ./start.sh</code> if it was already running).
        </div>
        {detail && (
          <pre className="text-term-muted text-[11px] whitespace-pre-wrap border border-term-border bg-term-panel2 p-2 overflow-auto max-h-32">
            {detail}
          </pre>
        )}
      </div>
    );
  }

  // Detect empty/invalid symbol: no last_price AND no name = not a real equity
  const hasPrice = q?.last_price != null;
  const hasName = (q?.name ?? p?.name) != null && (q?.name ?? p?.name) !== "";
  if (!hasPrice && !hasName) {
    return <NoDataBlock symbol={symbol} />;
  }

  const verdictColor = t.verdict === "Sparse" ? "text-term-muted" : "text-term-heading";

  return (
    <div className="p-1 grid gap-1 text-[12px]"
      style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)", gridTemplateRows: "auto auto 1fr" }}>
      {/* Header: symbol + price */}
      <div className="col-span-3 flex items-start justify-between border-b border-term-border pb-2">
        <div>
          <div className="flex items-baseline gap-4">
            <div className="text-[26px] text-term-heading font-bold tracking-widest">{symbol}</div>
            <div className="text-term-heading">{p?.name}</div>
            <div className="sub-header">{p?.stock_exchange ?? q?.exchange} · {p?.sector ?? "—"}</div>
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className={cn("text-3xl num font-bold", dir === "up" && "up", dir === "down" && "down")}>{fmtPrice(q?.last_price)}</div>
            <div className={cn("text-[14px] num", dir === "up" && "up", dir === "down" && "down")}>
              {chg == null ? "" : (chg >= 0 ? "+" : "") + fmtPrice(chg)} ({fmtPct(chgPct)})
            </div>
            <div className="sub-header">{p?.currency ?? q?.currency}</div>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1 min-w-[220px]">
          <div className="sub-header">INTELLIGENCE VERDICT</div>
          <div className={cn("text-2xl font-bold tracking-[0.2em]", verdictColor)}>
            {t.verdict.toUpperCase()}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-term-heading" /><span className="num text-term-heading">{t.bull}</span> bullish</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-term-muted" /><span className="num text-term-muted">{t.neutral}</span> neutral</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 border border-term-heading" /><span className="num text-term-text">{t.bear}</span> bearish</span>
          </div>
          <div className="sub-header">RULE-BASED · NOT INVESTMENT ADVICE</div>
        </div>
      </div>

      {/* Signal rows */}
      <SignalGroup title="TECHNICAL" signals={technicals} />
      <SignalGroup title="VALUATION" signals={valuation} />
      <SignalGroup title="FUNDAMENTALS" signals={fundamentals} />

      {/* Analyst + Dividend + Revenue trend */}
      <div className="panel">
        <div className="panel-header"><span>ANALYSTS</span><span className="sub-header normal-case tracking-normal font-normal">{e?.number_of_analysts ?? "—"} covering</span></div>
        <div className="p-1 flex flex-col gap-2">
          {analyst.map((s, i) => <SignalRow key={i} s={s} />)}
          <div className="mt-2 pt-2 border-t border-term-borderSoft grid grid-cols-2 gap-1 text-[11px]">
            <KV k="CURRENT" v={fmtPrice(e?.current_price ?? q?.last_price)} />
            <KV k="TARGET" v={<span className="text-term-heading">{fmtPrice(e?.target_consensus)}</span>} />
            <KV k="HIGH" v={<span className="text-term-heading">{fmtPrice(e?.target_high)}</span>} />
            <KV k="LOW" v={<span className="text-term-heading">{fmtPrice(e?.target_low)}</span>} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>DIVIDEND</span></div>
        <div className="p-1 flex flex-col gap-2">
          {shareholder.map((s, i) => <SignalRow key={i} s={s} />)}
          <div className="mt-2 pt-2 border-t border-term-borderSoft grid grid-cols-2 gap-1 text-[11px]">
            <KV k="YIELD" v={fmtPctFromDecimal(m?.dividend_yield ?? p?.dividend_yield)} />
            <KV k="PAYOUT" v={fmtPctFromDecimal(m?.payout_ratio)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>SIZE & TREND</span></div>
        <div className="p-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <KV k="MKT CAP" v={fmtVolume(m?.market_cap ?? p?.market_cap)} />
          <KV k="EV" v={fmtVolume(m?.enterprise_value)} />
          <KV k="SHARES" v={fmtVolume(p?.shares_outstanding)} />
          <KV k="BETA" v={p?.beta != null ? p.beta.toFixed(2) : "—"} />
          <div className="col-span-2 mt-2">
            <div className="sub-header">REVENUE TREND (ANNUAL)</div>
            {revSeries.length > 1 && (
              <div className="mt-1 flex items-end gap-1 h-10">
                {revSeries.map((v, i) => {
                  const max = Math.max(...revSeries);
                  const h = max > 0 ? (v / max) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 bg-term-amber/70 min-w-[8px]" style={{ height: `${h}%` }} title={fmtVolume(v)} />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: business summary + news */}
      <div className="col-span-2 panel">
        <div className="panel-header"><span>BUSINESS</span></div>
        <div className="p-1 text-[12px] text-term-text leading-relaxed max-h-[160px] overflow-auto scroll-thin">
          {p?.long_description ?? "No description available."}
        </div>
      </div>

      <div className="panel min-h-0">
        <div className="panel-header"><span>LATEST HEADLINES</span></div>
        <div className="flex-1 overflow-auto scroll-thin divide-y divide-term-borderSoft">
          {news.slice(0, 5).map((n, i) => (
            <a key={n.id + i} href={n.url} target="_blank" rel="noreferrer"
              className="block px-3 py-2 hover:bg-term-accentSubtle group">
              <div className="sub-header">{fmtTime(n.date)} · {n.source}</div>
              <div className="text-term-heading group-hover:text-term-accent mt-0.5 leading-snug">{n.title}</div>
            </a>
          ))}
          {news.length === 0 && <div className="p-3 text-term-muted">No news.</div>}
        </div>
      </div>

      {/* Navigation hint */}
      <div className="col-span-3 flex flex-wrap items-center gap-2 border-t border-term-border pt-2 text-[11px]">
        <span className="sub-header">DRILL DOWN:</span>
        {[
          { c: "GP", label: "Chart" }, { c: "HP", label: "Price History" },
          { c: "KEY", label: "All Ratios" }, { c: "FA", label: "Financials" },
          { c: "DVD", label: "Dividends" }, { c: "EE", label: "Analyst Detail" },
          { c: "NI", label: "All News" }, { c: "OMON", label: "Options" },
        ].map((x) => (
          <button key={x.c} onClick={() => openTab(x.c as never, symbol)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NoDataBlock({ symbol }: { symbol: string }) {
  const openTab = useWorkspace((s) => s.openTab);
  // Suggest similar tickers via SEC search
  const sug = useQuery({
    queryKey: ["intel-suggest", symbol],
    queryFn: () => searchSymbols(symbol, 6),
    staleTime: 60_000,
  });
  return (
    <div className="p-8 flex flex-col items-start gap-4 max-w-2xl">
      <div>
        <div className="text-term-red text-[11px] uppercase tracking-[0.3em] font-bold">NO DATA</div>
        <div className="text-term-heading text-xl mt-1">
          <span className="text-term-amber font-bold num">{symbol}</span> returned no usable data.
        </div>
      </div>
      <div className="text-term-text text-[12px] leading-relaxed">
        This ticker may be: a mutual fund / OTC / delisted security, or simply a typo.
        Yahoo Finance (the default provider) has no price, financials, or analyst coverage for it.
      </div>

      {sug.data && sug.data.length > 0 && (
        <div className="w-full">
          <div className="sub-header mb-2">Did you mean…</div>
          <div className="flex flex-col border border-term-border">
            {sug.data.map((r) => (
              <button
                key={r.cik || r.symbol}
                onClick={() => openTab("INTEL", r.symbol)}
                className="flex items-baseline gap-3 px-3 py-2 text-left hover:bg-term-accentSubtle border-b border-term-borderSoft last:border-0"
              >
                <span className="num text-term-amber font-bold w-20">{r.symbol}</span>
                <span className="text-term-heading flex-1 truncate">{r.name}</span>
                <span className="sub-header">OPEN INTEL →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-term-border pt-4 text-[11px]">
        <span className="sub-header">TRY:</span>
        {["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL"].map((s) => (
          <button key={s} onClick={() => openTab("INTEL", s)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-amber num">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
