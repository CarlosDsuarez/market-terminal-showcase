import { useQuery } from "@tanstack/react-query";
import { fetchCompareGroups, type GroupBy, type GroupMetric, type GroupRow } from "@/lib/api";
import { fmtPct, fmtVolume } from "@/lib/format";
import { cn } from "@/lib/cn";

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "sector", label: "Sector" },
  { id: "industry", label: "Industry" },
  { id: "country", label: "Country" },
  { id: "capitalization", label: "Cap" },
];

const METRICS: { id: GroupMetric; label: string }[] = [
  { id: "performance", label: "Performance" },
  { id: "valuation", label: "Valuation" },
  { id: "overview", label: "Overview" },
];

interface Props {
  group: GroupBy;
  metric: GroupMetric;
  onGroup: (g: GroupBy) => void;
  onMetric: (m: GroupMetric) => void;
  onPick: (name: string, group: GroupBy) => void;
}

export function GroupsPane({ group, metric, onGroup, onMetric, onPick }: Props) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["screener-groups", group, metric],
    queryFn: () => fetchCompareGroups(group, metric),
    staleTime: 120_000,
  });

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-term-border text-[11px]">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => onGroup(g.id)}
            className={cn("px-2 py-0.5 border", g.id === group ? "border-term-accent text-term-accent" : "border-term-border text-term-muted")}>
            {g.label}
          </button>
        ))}
        <span className="text-term-border">|</span>
        {METRICS.map((m) => (
          <button key={m.id} onClick={() => onMetric(m.id)}
            className={cn("px-2 py-0.5 border", m.id === metric ? "border-term-accent text-term-accent" : "border-term-border text-term-muted")}>
            {m.label}
          </button>
        ))}
      </div>
      {isLoading && <div className="p-4 text-term-muted">Loading groups…</div>}
      {error && <div className="p-4 text-term-red">{(error as Error).message}</div>}
      <div className="overflow-auto scroll-thin flex-1">
        <table className="w-full grid-data text-[12px]">
          <thead>
            <tr>
              <th>Name</th>
              {metric === "performance" && (
                <>
                  <th className="text-right">Week</th>
                  <th className="text-right">Month</th>
                  <th className="text-right">YTD</th>
                  <th className="text-right">Year</th>
                  <th className="text-right">Change</th>
                </>
              )}
              {metric === "valuation" && (
                <>
                  <th className="text-right">Mkt Cap</th>
                  <th className="text-right">P/E</th>
                  <th className="text-right">Fwd P/E</th>
                  <th className="text-right">PEG</th>
                </>
              )}
              {metric === "overview" && (
                <>
                  <th className="text-right">Stocks</th>
                  <th className="text-right">Mkt Cap</th>
                  <th className="text-right">Change</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name} className="cursor-pointer" onClick={() => onPick(row.name, group)}>
                <td className="text-term-amber">{row.name}</td>
                {metric === "performance" && <PerfCells row={row} />}
                {metric === "valuation" && (
                  <>
                    <td className="num text-right">{fmtVolume(row.market_cap)}</td>
                    <td className="num text-right">{fmtNum(row.pe)}</td>
                    <td className="num text-right">{fmtNum(row.forward_pe)}</td>
                    <td className="num text-right">{fmtNum(row.peg)}</td>
                  </>
                )}
                {metric === "overview" && (
                  <>
                    <td className="num text-right">{row.stocks ?? "—"}</td>
                    <td className="num text-right">{fmtVolume(row.market_cap)}</td>
                    <ChangeCell row={row} />
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1 border-t border-term-border sub-header">CLICK A GROUP TO APPLY IT AS A FILTER</div>
    </div>
  );
}

function fmtNum(n: number | undefined) {
  return n == null ? "—" : n.toFixed(2);
}

function pct(n: number | undefined) {
  if (n == null) return { text: "—", dir: undefined as "up" | "down" | undefined };
  return { text: fmtPct(n * 100), dir: n >= 0 ? "up" as const : "down" as const };
}

function PerfCells({ row }: { row: GroupRow }) {
  const cells = [row.performance_1w, row.performance_1m, row.performance_ytd, row.performance_1y];
  const chg = pct(typeof row["Change %"] === "number" ? row["Change %"] as number : undefined);
  return (
    <>
      {cells.map((v, i) => {
        const c = pct(v);
        return <td key={i} className={cn("num text-right", c.dir)}>{c.text}</td>;
      })}
      <td className={cn("num text-right", chg.dir)}>{chg.text}</td>
    </>
  );
}

function ChangeCell({ row }: { row: GroupRow }) {
  const n = typeof row["Change %"] === "number" ? (row["Change %"] as number) : undefined;
  const c = pct(n);
  return <td className={cn("num text-right", c.dir)}>{c.text}</td>;
}
