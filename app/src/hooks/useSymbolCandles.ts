import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEquityHistoricalBatch, isoDaysAgo, type Candle } from "@/lib/api";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";

/**
 * Daily bars for a set of symbols in one request, ending at the terminal's
 * current date. WATCH, CORR and SCR all read through here so a shared symbol
 * set costs one round trip rather than one per screen.
 */
export function useSymbolCandles(symbols: string[], days = 365) {
  const simDate = useSim((s) => s.asOf);
  const asOf = simDate ?? todayIso();
  const key = [...symbols].sort().join(",");

  const q = useQuery({
    queryKey: ["symbol-candles", key, days, asOf],
    queryFn: () =>
      fetchEquityHistoricalBatch(symbols, { start_date: isoDaysAgo(days), end_date: asOf }),
    enabled: symbols.length > 0,
    staleTime: 60_000,
  });

  const bySymbol = useMemo(() => q.data ?? ({} as Record<string, Candle[]>), [q.data]);

  return { bySymbol, asOf, isLoading: q.isLoading, error: (q.error as Error) ?? null };
}
