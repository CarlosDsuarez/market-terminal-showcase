import { useQuery } from "@tanstack/react-query";
import { fetchIndexHistoricalBatch } from "@/lib/api";
import { fmtPrice, fmtPct, fmtVolume } from "@/lib/format";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";

const INDICES = [
  { sym: "^GSPC",   name: "S&P 500",       region: "Americas" },
  { sym: "^DJI",    name: "Dow Jones",     region: "Americas" },
  { sym: "^IXIC",   name: "NASDAQ Comp",   region: "Americas" },
  { sym: "^RUT",    name: "Russell 2000",  region: "Americas" },
  { sym: "^GSPTSE", name: "TSX Comp",      region: "Americas" },
  { sym: "^BVSP",   name: "Bovespa",       region: "Americas" },
  { sym: "^FTSE",   name: "FTSE 100",      region: "EMEA" },
  { sym: "^GDAXI",  name: "DAX",           region: "EMEA" },
  { sym: "^FCHI",   name: "CAC 40",        region: "EMEA" },
  { sym: "^STOXX50E", name: "Euro Stoxx 50", region: "EMEA" },
  { sym: "^IBEX",   name: "IBEX 35",       region: "EMEA" },
  { sym: "^N225",   name: "Nikkei 225",    region: "Asia-Pac" },
  { sym: "^HSI",    name: "Hang Seng",     region: "Asia-Pac" },
  { sym: "^AXJO",   name: "ASX 200",       region: "Asia-Pac" },
  { sym: "^KS11",   name: "KOSPI",         region: "Asia-Pac" },
  { sym: "^TWII",   name: "TAIEX",         region: "Asia-Pac" },
];

const SYMBOLS = INDICES.map((i) => i.sym);

export function WEI() {
  const asOf = useSim((s) => s.asOf) ?? todayIso();
  const { data, isLoading } = useQuery({
    queryKey: ["index-hist-batch", SYMBOLS, asOf],
    queryFn: () => fetchIndexHistoricalBatch(SYMBOLS, 10, asOf),
    refetchInterval: 60_000,
  });

  const regions = Array.from(new Set(INDICES.map((i) => i.region)));

  return (
    <div className="p-1 flex flex-col gap-1 text-[12px]">
      {regions.map((region) => (
        <div key={region}>
          <div className="text-term-amber text-[10px] tracking-[0.25em] font-bold border-b border-term-border pb-1 mb-2">{region.toUpperCase()}</div>
          <table className="w-full grid-data">
            <thead>
              <tr>
                <th>Index</th>
                <th>Symbol</th>
                <th className="text-right">Last</th>
                <th className="text-right">Day Δ</th>
                <th className="text-right">Δ %</th>
                <th className="text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {INDICES.filter((idx) => idx.region === region).map((idx) => {
                const series = data?.[idx.sym] ?? [];
                const last = series[series.length - 1];
                const prev = series[series.length - 2];
                const chg = last && prev ? last.close - prev.close : undefined;
                const chgPct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : undefined;
                const dir = chg == null ? "flat" : chg >= 0 ? "up" : "down";
                return (
                  <tr key={idx.sym}>
                    <td className="text-term-heading">{idx.name}</td>
                    <td className="text-term-muted num">{idx.sym}</td>
                    <td className="num text-right">{isLoading ? "…" : fmtPrice(last?.close, 2)}</td>
                    <td className={cn("num text-right", dir === "up" && "up", dir === "down" && "down")}>
                      {chg == null ? "—" : (chg >= 0 ? "+" : "") + fmtPrice(chg, 2)}
                    </td>
                    <td className={cn("num text-right", dir === "up" && "up", dir === "down" && "down")}>
                      {fmtPct(chgPct)}
                    </td>
                    <td className="num text-right text-term-muted">
                      {fmtVolume(last?.volume)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <div className="sub-header">LAST CLOSE COMPARED WITH PREVIOUS SESSION · REFRESHES EVERY 60S</div>
    </div>
  );
}
