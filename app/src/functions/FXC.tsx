import { useQuery } from "@tanstack/react-query";
import { fetchFxHistoricalBatch } from "@/lib/api";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";

const MAJORS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY", "USDCNY", "USDMXN"];

const yahooPair = (pair: string) => `${pair}=X`;
const SYMBOLS = MAJORS.map(yahooPair);

export function FXC() {
  const asOf = useSim((s) => s.asOf) ?? todayIso();
  const { data: bySymbol, isLoading } = useQuery({
    queryKey: ["fx-batch", SYMBOLS, asOf],
    queryFn: () => fetchFxHistoricalBatch(SYMBOLS, 10, asOf),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-3 text-[12px]">
      <div className="text-term-amber text-[10px] tracking-[0.25em] font-bold border-b border-term-border pb-1 mb-2">MAJOR PAIRS</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {MAJORS.map((pair) => {
          const data = bySymbol?.[yahooPair(pair)] ?? [];
          const last = data[data.length - 1];
          const prev = data[data.length - 2];
          const chgPct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : undefined;
          const dir = chgPct == null ? "flat" : chgPct >= 0 ? "up" : "down";

          // Build tiny sparkline
          const vals = data.map((d) => d.close);
          const min = Math.min(...vals), max = Math.max(...vals);
          const spark = vals.length > 1 ? vals.map((v, idx) => {
            const x = (idx / (vals.length - 1)) * 100;
            const y = 32 - ((v - min) / (max - min || 1)) * 28;
            return `${x},${y}`;
          }).join(" ") : "";

          return (
            <div key={pair} className="panel">
              <div className="flex items-center justify-between px-2 py-1 border-b border-term-border bg-term-panel2">
                <span className="text-term-amber font-bold tracking-wider text-[11px]">{pair.slice(0,3)}/{pair.slice(3)}</span>
                <span className={cn("num text-[11px]", dir === "up" && "up", dir === "down" && "down")}>{fmtPct(chgPct)}</span>
              </div>
              <div className="px-2 py-2 flex items-center justify-between">
                <div className="num text-[16px] text-term-heading">
                  {isLoading ? "…" : last?.close != null ? last.close.toFixed(pair.includes("JPY") ? 3 : 5) : "—"}
                </div>
                {spark && (
                  <svg viewBox="0 0 100 32" className="w-20 h-8">
                    <polyline fill="none" stroke={dir === "up" ? "#22ee22" : dir === "down" ? "#ff3b3b" : "#f5f5f5"} strokeWidth="1.2" points={spark} />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sub-header mt-3">CLOSE-OVER-CLOSE · 60S REFRESH</div>
    </div>
  );
}
