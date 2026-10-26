import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorical, isoDaysAgo } from "@/lib/api";
import { fmtPrice, fmtVolume, fmtDate, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";
import { QueryState } from "@/components/QueryState";
import { downloadTextCsv } from "@/lib/export";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 365 * 5 },
];

export function HP({ symbol }: { symbol: string }) {
  const asOf = useSim((s) => s.asOf) ?? todayIso();
  const [range, setRange] = useState(RANGES[1]);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["historical-table", symbol, range.label, asOf],
    queryFn: () => fetchHistorical(symbol, { start_date: isoDaysAgo(range.days), end_date: asOf }),
  });

  const sorted = [...data].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 px-3 h-8 border-b border-term-border bg-term-panel2 text-[11px] uppercase tracking-wider">
        <span className="text-term-amber">RANGE</span>
        {RANGES.map((r) => (
          <button key={r.label} onClick={() => setRange(r)}
            className={cn("px-1 py-0.5 border",
              r.label === range.label ? "border-term-accent bg-term-accent text-term-bg" : "border-transparent text-term-muted hover:text-term-text")}>
            {r.label}
          </button>
        ))}
        <span className="ml-auto text-term-muted">{sorted.length} rows</span>
        <button
          type="button"
          onClick={() =>
            downloadTextCsv(
              `${symbol}-HP-${range.label}.csv`,
              ["Date", "Open", "High", "Low", "Close", "Volume"],
              sorted.map((r) => [r.date, r.open, r.high, r.low, r.close, r.volume]),
            )
          }
          disabled={sorted.length === 0}
          className="px-2 py-0.5 border border-term-border text-term-muted hover:text-term-accent hover:border-term-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        <QueryState isLoading={isLoading} error={error} refetch={() => refetch()} empty={sorted.length === 0} emptyLabel="No prices in this range.">
          <table className="w-full text-[12px] grid-data">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Open</th>
                <th className="text-right">High</th>
                <th className="text-right">Low</th>
                <th className="text-right">Close</th>
                <th className="text-right">Δ%</th>
                <th className="text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const prev = sorted[i + 1];
                const chg = prev ? ((r.close - prev.close) / prev.close) * 100 : undefined;
                return (
                  <tr key={r.date}>
                    <td className="num">{fmtDate(r.date)}</td>
                    <td className="num text-right">{fmtPrice(r.open)}</td>
                    <td className="num text-right up">{fmtPrice(r.high)}</td>
                    <td className="num text-right down">{fmtPrice(r.low)}</td>
                    <td className="num text-right text-term-heading">{fmtPrice(r.close)}</td>
                    <td className={cn("num text-right", chg != null && (chg >= 0 ? "up" : "down"))}>{fmtPct(chg)}</td>
                    <td className="num text-right text-term-muted">{fmtVolume(r.volume)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </QueryState>
      </div>
    </div>
  );
}
