import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchNewsCompany, fetchScreener, type GroupBy, type GroupMetric } from "@/lib/api";
import {
  ALL_COLUMNS, FETCH_LIMITS, PAGE_SIZES, SIGNALS, VIEW_COLUMNS,
  metricForColumn, type ColumnDef, type ScreenerMetric,
} from "@/lib/screener/catalog";
import {
  activeFilterCount, applyCustomFilters, buildScreenerRequest,
  mergeRowsBySymbol, rowNumber, rowText,
  type FilterMap, type FilterValue, type ScreenerRow,
} from "@/lib/screener/query";
import { downloadCsv, rowsToCsv } from "@/lib/screener/format";
import { FilterChips, FilterGrid } from "@/components/screener/FilterGrid";
import { ResultTable } from "@/components/screener/ResultTable";
import { ChartGrid } from "@/components/screener/ChartGrid";
import { GroupsPane } from "@/components/screener/GroupsPane";
import { BUILTIN_PRESETS, useScreener, type ScreenerView } from "@/store/screenerStore";
import { useWatchlist } from "@/store/watchlistStore";
import { useWorkspace } from "@/store/workspaceStore";
import type { FunctionCode } from "@/lib/functions";
import { cn } from "@/lib/cn";
import { IS_SYNTHETIC } from "@/lib/dataMode";

const TABS: { id: ScreenerView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "valuation", label: "Valuation" },
  { id: "financial", label: "Financial" },
  { id: "ownership", label: "Ownership" },
  { id: "performance", label: "Performance" },
  { id: "technical", label: "Technical" },
  { id: "custom", label: "Custom" },
  { id: "charts", label: "Charts" },
  { id: "tickers", label: "Tickers" },
  { id: "bulk", label: "Bulk" },
  { id: "news", label: "News" },
  { id: "groups", label: "Groups" },
];

const METRICS = new Set<ScreenerView>(["overview", "valuation", "financial", "ownership", "performance", "technical"]);

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function SCR() {
  const openTab = useWorkspace((s) => s.openTab);
  const addToWatchlist = useWatchlist((s) => s.add);
  const addMany = useWatchlist((s) => s.addMany);
  const pageSize = useScreener((s) => s.pageSize);
  const fetchLimit = useScreener((s) => s.fetchLimit);
  const setPageSize = useScreener((s) => s.setPageSize);
  const setFetchLimit = useScreener((s) => s.setFetchLimit);
  const customColumns = useScreener((s) => s.customColumns);
  const setCustomColumns = useScreener((s) => s.setCustomColumns);
  const presets = useScreener((s) => s.presets);
  const savePreset = useScreener((s) => s.savePreset);
  const deletePreset = useScreener((s) => s.deletePreset);

  const [filters, setFilters] = useState<FilterMap>({});
  const [signal, setSignal] = useState<string | null>("top_gainers");
  const [view, setView] = useState<ScreenerView>("overview");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [jump, setJump] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [presetName, setPresetName] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("sector");
  const [groupMetric, setGroupMetric] = useState<GroupMetric>("performance");

  const debouncedFilters = useDebounced(filters, 400);
  const debouncedSignal = useDebounced(signal, 200);

  // Back to page 1 whenever the query changes (state adjusted during render, not in an effect).
  const pageKey = JSON.stringify([debouncedFilters, debouncedSignal, view, fetchLimit]);
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey !== prevPageKey) {
    setPrevPageKey(pageKey);
    setPage(0);
  }

  const metricsNeeded: ScreenerMetric[] = useMemo(() => {
    if (METRICS.has(view)) return [view as ScreenerMetric];
    if (view === "custom") {
      const set = new Set<ScreenerMetric>();
      for (const id of customColumns) {
        const m = metricForColumn(id);
        if (m) set.add(m);
      }
      return set.size ? [...set] : ["overview"];
    }
    return ["overview"];
  }, [view, customColumns]);

  const requestBase = useMemo(() => buildScreenerRequest({
    metric: metricsNeeded[0],
    signal: debouncedSignal,
    filters: debouncedFilters,
    limit: fetchLimit,
  }), [metricsNeeded, debouncedSignal, debouncedFilters, fetchLimit]);

  const enabled = view !== "groups";

  const queries = useQueries({
    queries: metricsNeeded.map((metric) => ({
      queryKey: ["screener", metric, requestBase.signal, requestBase.filters_dict, requestBase.limit],
      queryFn: () => fetchScreener({ ...requestBase, metric }),
      staleTime: 120_000,
      enabled,
    })),
  });

  const rawRows: ScreenerRow[] = useMemo(() => {
    const parts = queries.map((q) => q.data ?? []);
    if (parts.every((p) => p.length === 0)) return [];
    return parts.length === 1 ? parts[0] : mergeRowsBySymbol(parts);
  }, [queries]);

  const filtered = useMemo(() => {
    let rows = applyCustomFilters(rawRows, debouncedFilters);
    const j = jump.trim().toUpperCase();
    if (j) rows = rows.filter((r) => String(r.symbol ?? "").includes(j) || String(r.name ?? "").toUpperCase().includes(j));
    return rows;
  }, [rawRows, debouncedFilters, jump]);

  const columns: ColumnDef[] = useMemo(() => {
    if (view === "custom") {
      const byId = new Map(ALL_COLUMNS.map((c) => [c.id, c]));
      return customColumns.map((id) => byId.get(id)).filter((c): c is ColumnDef => c != null);
    }
    if (METRICS.has(view)) return VIEW_COLUMNS[view as ScreenerMetric];
    return VIEW_COLUMNS.overview;
  }, [view, customColumns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.id === sortKey) ?? ALL_COLUMNS.find((c) => c.id === sortKey);
    const keys = col ? [col.id, ...(col.keys ?? [])] : [sortKey];
    const copy = [...filtered];
    copy.sort((a, b) => {
      const an = rowNumber(a, keys);
      const bn = rowNumber(b, keys);
      if (an != null && bn != null) return sortDir === "asc" ? an - bn : bn - an;
      const at = rowText(a, keys) ?? "";
      const bt = rowText(b, keys) ?? "";
      return sortDir === "asc" ? at.localeCompare(bt) : bt.localeCompare(at);
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  // Sliced inline before, so every keystroke in the header inputs (jump,
  // preset name, filter search) handed the table a fresh array and redrew
  // every row. Memoised, only page/sort/filter changes redraw.
  const pageRows = useMemo(
    () => sorted.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [sorted, safePage, pageSize],
  );

  const loading = enabled && queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error as Error | undefined;
  const nActive = activeFilterCount(filters, signal);

  const setFilter = (key: string, value: FilterValue | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const applyPreset = (id: string) => {
    const p = [...BUILTIN_PRESETS, ...presets].find((x) => x.id === id);
    if (!p) return;
    setFilters(p.filters);
    setSignal(p.signal);
    setView(p.view);
    setCustomColumns(p.customColumns);
    setPresetName(p.name);
  };

  const onPickGroup = (name: string, g: GroupBy) => {
    if (g === "sector") setFilter("Sector", { kind: "preset", option: name });
    else if (g === "industry") setFilter("Industry", { kind: "preset", option: name });
    else if (g === "country") setFilter("Country", { kind: "preset", option: name });
    setView("overview");
    setSignal(null);
  };

  const toggleSort = useCallback((id: string) => {
    if (sortKey === id) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(id); setSortDir("desc"); }
  }, [sortKey]);

  const toggleSel = useCallback((sym: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });
  }, []);

  const openIntel = useCallback((s: string) => openTab("INTEL", s), [openTab]);

  const symbols = useMemo(
    () => sorted.map((r) => String(r.symbol ?? "")).filter(Boolean),
    [sorted],
  );

  return (
    <div className="h-full flex flex-col text-[12px] min-h-0">
      <div className="flex items-center gap-3 px-3 h-9 border-b border-term-border bg-term-panel2 shrink-0">
        <span className="text-[16px] text-term-amber font-bold tracking-wider">SCREENER</span>
        <span className="sub-header">
          {view === "groups" ? "groups" : `${sorted.length} match${loading ? " · loading…" : ""}`}
          {nActive ? ` · ${nActive} filter${nActive === 1 ? "" : "s"}` : ""}
        </span>
        <select
          className="bg-term-bg2 border border-term-border px-1 py-0.5 text-[11px] ml-2"
          value={signal ?? ""}
          onChange={(e) => setSignal(e.target.value || null)}
        >
          <option value="">Signal: none</option>
          {SIGNALS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <input
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          placeholder="Jump ticker"
          className="bg-term-bg2 border border-term-border px-2 py-0.5 w-28 text-[11px] focus:outline-none focus:border-term-accent"
        />
        <button onClick={() => { setFilters({}); setSignal(null); }} className="sub-header hover:text-term-accent">reset</button>
        <span className="ml-auto flex items-center gap-1">
          <select
            className="bg-term-bg2 border border-term-border px-1 py-0.5 text-[11px] max-w-[140px]"
            value=""
            onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
          >
            <option value="">Load preset…</option>
            <optgroup label="Built-in">
              {BUILTIN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
            {presets.length > 0 && (
              <optgroup label="Saved">
                {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Save as"
            className="bg-term-bg2 border border-term-border px-2 py-0.5 w-24 text-[11px]"
          />
          <button
            onClick={() => {
              if (!presetName.trim()) return;
              savePreset({ name: presetName, signal, filters, view, customColumns });
            }}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent text-[10px] tracking-wider"
          >
            SAVE
          </button>
          {presets.some((p) => p.name === presetName.trim()) && (
            <button
              onClick={() => {
                const p = presets.find((x) => x.name === presetName.trim());
                if (p) deletePreset(p.id);
              }}
              className="px-2 py-0.5 border border-term-border hover:border-term-red text-[10px] tracking-wider"
            >
              DEL
            </button>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1 px-2 h-8 border-b border-term-border overflow-x-auto scroll-thin shrink-0">
        <button onClick={() => setFiltersOpen((o) => !o)} className="px-2 py-0.5 border border-term-border text-[10px] tracking-wider">
          {filtersOpen ? "HIDE FILTERS" : "SHOW FILTERS"}
        </button>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={cn("px-2 py-0.5 border text-[10px] tracking-wider",
              t.id === view ? "border-term-accent text-term-accent" : "border-transparent text-term-muted hover:text-term-text")}>
            {t.label}
          </button>
        ))}
      </div>

      {filtersOpen && view !== "groups" && (
        <div className="border-b border-term-border max-h-[40%] overflow-auto scroll-thin shrink-0">
          <div className="flex items-center gap-2 px-3 pt-2">
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Find a filter…"
              className="bg-term-bg2 border border-term-border px-2 py-0.5 text-[11px] w-48 focus:outline-none focus:border-term-accent"
            />
            <span className="sub-header">Industry = ETF to screen funds · custom min/max = nearest preset bucket + client-side cut</span>
          </div>
          <FilterGrid filters={filters} onChange={setFilter} query={filterQuery} />
          <FilterChips filters={filters} onClear={(k) => setFilter(k, undefined)} />
        </div>
      )}

      {view === "custom" && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 border-b border-term-border text-[10px] max-h-24 overflow-auto scroll-thin shrink-0">
          {ALL_COLUMNS.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-term-muted">
              <input
                type="checkbox"
                checked={customColumns.includes(c.id)}
                onChange={() => {
                  const next = customColumns.includes(c.id)
                    ? customColumns.filter((x) => x !== c.id)
                    : [...customColumns, c.id];
                  setCustomColumns(next);
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {error && (
          <div className="px-3 py-2 text-term-red border-b border-term-border">
            {error.message}
          </div>
        )}
        {loading && <div className="px-3 py-1 sub-header">{IS_SYNTHETIC ? "Generating synthetic screen…" : "Fetching Finviz via OpenBB…"}</div>}

        {view === "groups" && (
          <GroupsPane group={groupBy} metric={groupMetric} onGroup={setGroupBy} onMetric={setGroupMetric} onPick={onPickGroup} />
        )}
        {view === "charts" && <ChartGrid rows={pageRows} onOpen={(s) => openTab("GP", s)} />}
        {view === "tickers" && (
          <div className="p-3 flex flex-wrap gap-2 overflow-auto scroll-thin">
            {sorted.map((r) => (
              <button key={String(r.symbol)} onClick={() => openTab("INTEL", String(r.symbol))}
                className="px-2 py-0.5 border border-term-border text-term-amber hover:border-term-accent num">
                {String(r.symbol)}
              </button>
            ))}
          </div>
        )}
        {view === "bulk" && (
          <div className="p-3 flex flex-col gap-2 min-h-0">
            <textarea
              readOnly
              className="flex-1 min-h-[160px] bg-term-bg2 border border-term-border p-2 num text-term-heading"
              value={symbols.join("\n")}
            />
            <div className="flex gap-2">
              <button onClick={() => void navigator.clipboard.writeText(symbols.join(","))}
                className="px-2 py-0.5 border border-term-border hover:border-term-accent text-[10px] tracking-wider">COPY CSV</button>
              <button onClick={() => addMany(symbols)}
                className="px-2 py-0.5 border border-term-border hover:border-term-accent text-[10px] tracking-wider">+ WATCH (MAX 30)</button>
            </div>
          </div>
        )}
        {view === "news" && (
          <NewsPane
            symbols={pageRows.map((r) => String(r.symbol ?? "")).filter(Boolean)}
            onOpen={(code, symbol) => openTab(code, symbol)}
          />
        )}
        {view !== "groups" && view !== "charts" && view !== "tickers" && view !== "bulk" && view !== "news" && (
          <ResultTable
            rows={pageRows}
            columns={columns}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            selected={selected}
            onToggle={toggleSel}
            onOpen={openIntel}
            onWatch={addToWatchlist}
            offset={safePage * pageSize}
          />
        )}
      </div>

      {view !== "groups" && (
        <div className="flex items-center gap-2 px-3 h-8 border-t border-term-border text-[10px] shrink-0">
          <span className="sub-header">PAGE {safePage + 1}/{pageCount}</span>
          <button disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-1 border border-term-border disabled:opacity-40">‹</button>
          <button disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)} className="px-1 border border-term-border disabled:opacity-40">›</button>
          <span className="text-term-muted">rows</span>
          {PAGE_SIZES.map((n) => (
            <button key={n} onClick={() => setPageSize(n)}
              className={cn("px-1 border", n === pageSize ? "border-term-accent text-term-accent" : "border-term-border text-term-muted")}>{n}</button>
          ))}
          <span className="text-term-muted ml-2">fetch</span>
          {FETCH_LIMITS.map((n) => (
            <button key={n} onClick={() => setFetchLimit(n)}
              className={cn("px-1 border", n === fetchLimit ? "border-term-accent text-term-accent" : "border-term-border text-term-muted")}>{n}</button>
          ))}
          <button
            onClick={() => downloadCsv("screener.csv", rowsToCsv(sorted, columns))}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent tracking-wider ml-2"
          >
            CSV
          </button>
          <span className="ml-auto flex gap-2">
            <button onClick={() => openTab("WATCH")} className="text-term-muted hover:text-term-accent tracking-wider">WATCH</button>
            <button
              onClick={() => openTab("COMP", [...selected].slice(0, 8).join(",") || symbols.slice(0, 5).join(","))}
              className="text-term-muted hover:text-term-accent tracking-wider"
            >
              COMP
            </button>
            <button onClick={() => openTab("MOV")} className="text-term-muted hover:text-term-accent tracking-wider">MOV</button>
          </span>
        </div>
      )}

      <div className="px-3 py-1 border-t border-term-borderSoft text-[10px] text-term-muted leading-relaxed">
        {IS_SYNTHETIC ? "Synthetic universe (fictional tickers); preset filters are not evaluated against it; custom min/max ranges are applied client-side. Live mode: quotes delayed via Finviz (OpenBB)." : "Quotes delayed via Finviz (OpenBB)."} Chart patterns are Finviz&apos;s detector, not ours.
        Custom ranges request the covering bucket then cut client-side. No Trades/Maps/premarket.
        Type <span className="text-term-amber">EQS</span> or <span className="text-term-amber">SCR</span>.
      </div>
    </div>
  );
}

function NewsPane({
  symbols, onOpen,
}: {
  symbols: string[];
  onOpen: (code: FunctionCode, symbol: string) => void;
}) {
  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["screener-news", s],
      queryFn: () => fetchNewsCompany(s, 3),
      staleTime: 120_000,
    })),
  });
  return (
    <div className="overflow-auto scroll-thin p-3 flex flex-col gap-3">
      {symbols.map((s, i) => {
        const items = queries[i]?.data ?? [];
        return (
          <div key={s} className="border-b border-term-borderSoft pb-2">
            <button onClick={() => onOpen("INTEL", s)} className="text-term-amber font-semibold num mr-2">{s}</button>
            <button onClick={() => onOpen("NI", s)} className="text-[10px] text-term-muted hover:text-term-accent tracking-wider">NI</button>
            {queries[i]?.isLoading && <span className="text-term-muted ml-2">…</span>}
            <ul className="mt-1 space-y-0.5">
              {items.map((n) => (
                <li key={n.id} className="text-term-heading truncate">
                  <a href={n.url} target="_blank" rel="noreferrer" className="hover:text-term-accent">{n.title}</a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
