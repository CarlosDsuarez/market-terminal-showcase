import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEquityHistoricalBatch, type Candle } from "@/lib/api";
import { parseIso, toIso, todayIso } from "@/lib/asOf";
import { portfolioWithAlgoFills } from "@/lib/algo";
import {
  buildEquityCurve, symbolsOf, type Portfolio, type Snapshot, type Trade,
} from "@/lib/portfolio";
import { useSim } from "@/store/simStore";
import { activePortfolio, usePortfolios } from "@/store/portfolioStore";

export interface PortfolioData {
  portfolio?: Portfolio;
  asOf: string;
  prices: Record<string, Candle[]>;
  curve: Snapshot[];
  rejected: { trade: Trade; reason: string }[];
  snapshot?: Snapshot;
  isLoading: boolean;
  error: Error | null;
}

/**
 * The single price request every portfolio screen shares.
 *
 * PORT, TRADE, PERF, RISK and ALGO all mount their own copy of this hook, but the
 * query key is derived only from the portfolio and the window — so they hit one
 * cache entry rather than firing identical batch requests.
 */
export function usePortfolioData(): PortfolioData {
  const stored = usePortfolios(activePortfolio);
  const simDate = useSim((s) => s.asOf);
  const asOf = simDate ?? todayIso();

  const symbols = useMemo(() => (stored ? symbolsOf(stored) : []), [stored]);

  // VWAP needs ~20 sessions of volume before the window. Inception alone is not
  // always enough, so the request starts a month before the book opens. The
  // equity curve still begins at inception; extra bars are only for ADV.
  const priceStart = useMemo(() => {
    if (!stored) return asOf;
    const d = parseIso(stored.inceptionDate);
    d.setDate(d.getDate() - 40);
    return toIso(d);
  }, [stored, asOf]);

  const q = useQuery({
    queryKey: ["portfolio-prices", stored?.id, priceStart, asOf, symbols.join(",")],
    queryFn: () =>
      fetchEquityHistoricalBatch(symbols, {
        start_date: priceStart,
        end_date: asOf,
      }),
    enabled: Boolean(stored) && symbols.length > 0,
    staleTime: 60_000,
  });

  const prices = useMemo(() => q.data ?? {}, [q.data]);

  const portfolio = useMemo(
    () => (stored ? portfolioWithAlgoFills(stored, prices, asOf) : undefined),
    [stored, prices, asOf],
  );

  const result = useMemo(
    () => (portfolio ? buildEquityCurve(portfolio, prices, asOf) : { snapshots: [] as Snapshot[], rejected: [] }),
    [portfolio, prices, asOf],
  );

  return {
    portfolio,
    asOf,
    prices,
    curve: result.snapshots,
    rejected: result.rejected,
    snapshot: result.snapshots[result.snapshots.length - 1],
    isLoading: q.isLoading,
    error: (q.error as Error) ?? null,
  };
}
