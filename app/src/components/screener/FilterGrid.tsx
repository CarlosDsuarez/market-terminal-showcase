import { FILTERS, type FilterCategory } from "@/lib/screener/catalog";
import type { FilterMap, FilterValue } from "@/lib/screener/query";
import { cn } from "@/lib/cn";

const SELECT =
  "bg-term-bg2 border border-term-border px-1 py-0.5 text-[11px] text-term-text focus:outline-none focus:border-term-accent max-w-[160px]";
const NUM =
  "bg-term-bg2 border border-term-border px-1 py-0.5 num text-[11px] text-term-text focus:outline-none focus:border-term-accent w-16";

const CAT: { id: FilterCategory; label: string }[] = [
  { id: "descriptive", label: "Descriptive" },
  { id: "fundamental", label: "Fundamental" },
  { id: "technical", label: "Technical" },
];

interface Props {
  filters: FilterMap;
  onChange: (key: string, value: FilterValue | undefined) => void;
  query: string;
}

export function FilterGrid({ filters, onChange, query }: Props) {
  const q = query.trim().toLowerCase();
  return (
    <div className="flex flex-col gap-3 p-3">
      {CAT.map((cat) => {
        const list = FILTERS.filter((f) => f.category === cat.id && (!q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)));
        if (list.length === 0) return null;
        return (
          <div key={cat.id}>
            <div className="sub-header mb-2">{cat.label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-2">
              {list.map((f) => {
                const cur = filters[f.key];
                const isCustom = cur?.kind === "custom";
                const selectVal = isCustom ? "__custom__" : cur?.kind === "preset" ? cur.option : "";
                return (
                  <label key={f.key} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] text-term-muted truncate" title={f.label}>{f.label}</span>
                    <select
                      className={SELECT}
                      value={selectVal}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) onChange(f.key, undefined);
                        else if (v === "__custom__") onChange(f.key, { kind: "custom" });
                        else onChange(f.key, { kind: "preset", option: v });
                      }}
                    >
                      <option value="">Any</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                      {f.custom && <option value="__custom__">Custom</option>}
                    </select>
                    {isCustom && (
                      <span className="flex items-center gap-1">
                        <input
                          className={NUM}
                          placeholder="min"
                          value={cur.min ?? ""}
                          onChange={(e) => onChange(f.key, { kind: "custom", min: numOrUndef(e.target.value), max: cur.max })}
                        />
                        <span className="text-term-muted">–</span>
                        <input
                          className={NUM}
                          placeholder="max"
                          value={cur.max ?? ""}
                          onChange={(e) => onChange(f.key, { kind: "custom", min: cur.min, max: numOrUndef(e.target.value) })}
                        />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      <div>
        <div className="sub-header mb-2">ETF</div>
        <p className="text-[10px] text-term-muted mb-2 max-w-3xl">
          OpenBB does not expose Finviz ETF-only fields (expense ratio, AUM, asset class).
          Screen funds with Industry, or exclude them.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange("Industry", { kind: "preset", option: "Exchange Traded Fund" })}
            className={cn(
              "px-2 py-0.5 border text-[10px] tracking-wider",
              filters.Industry?.kind === "preset" && filters.Industry.option === "Exchange Traded Fund"
                ? "border-term-accent text-term-accent"
                : "border-term-border text-term-heading hover:border-term-accent",
            )}
          >
            ETFs only
          </button>
          <button
            type="button"
            onClick={() => onChange("Industry", { kind: "preset", option: "Stocks only (ex-Funds)" })}
            className={cn(
              "px-2 py-0.5 border text-[10px] tracking-wider",
              filters.Industry?.kind === "preset" && filters.Industry.option === "Stocks only (ex-Funds)"
                ? "border-term-accent text-term-accent"
                : "border-term-border text-term-heading hover:border-term-accent",
            )}
          >
            Stocks only
          </button>
        </div>
      </div>
    </div>
  );
}

function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function FilterChips({ filters, onClear }: { filters: FilterMap; onClear: (key: string) => void }) {
  const chips = Object.entries(filters).flatMap(([key, v]) => {
    if (v.kind === "preset" && v.option && v.option !== "Any") return [{ key, label: `${key}: ${v.option}` }];
    if (v.kind === "custom" && (v.min != null || v.max != null)) {
      return [{ key, label: `${key}: ${v.min ?? "…"}–${v.max ?? "…"}` }];
    }
    return [];
  });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onClear(c.key)}
          className={cn("px-1.5 py-0.5 border border-term-border text-[10px] text-term-heading hover:border-term-accent")}
        >
          {c.label} ×
        </button>
      ))}
    </div>
  );
}
