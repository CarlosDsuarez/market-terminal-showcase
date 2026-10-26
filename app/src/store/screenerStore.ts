import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { backingStorage } from "@/lib/storage";
import { ALL_COLUMNS, DEFAULT_CUSTOM_COLUMNS, DEFAULT_FETCH_LIMIT, PAGE_SIZES } from "@/lib/screener/catalog";
import type { ScreenerMetric } from "@/lib/screener/catalog";
import type { FilterMap } from "@/lib/screener/query";

export type ScreenerView = ScreenerMetric | "custom" | "charts" | "tickers" | "bulk" | "news" | "groups";

export interface ScreenerPreset {
  id: string;
  name: string;
  signal: string | null;
  filters: FilterMap;
  view: ScreenerView;
  customColumns: string[];
}

export interface PersistedScreener {
  pageSize: number;
  fetchLimit: number;
  customColumns: string[];
  presets: ScreenerPreset[];
}

interface ScreenerState extends PersistedScreener {
  setPageSize: (n: number) => void;
  setFetchLimit: (n: number) => void;
  setCustomColumns: (ids: string[]) => void;
  savePreset: (p: Omit<ScreenerPreset, "id"> & { id?: string }) => void;
  deletePreset: (id: string) => void;
}

const STORAGE_KEY = "market-terminal-screener";
const COLUMN_IDS = new Set(ALL_COLUMNS.map((c) => c.id));
const VIEWS = new Set<string>([
  "overview", "valuation", "financial", "ownership", "performance", "technical",
  "custom", "charts", "tickers", "bulk", "news", "groups",
]);

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFilters(raw: unknown): FilterMap {
  if (!raw || typeof raw !== "object") return {};
  const out: FilterMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    if (rec.kind === "preset" && typeof rec.option === "string") {
      out[k] = { kind: "preset", option: rec.option };
    } else if (rec.kind === "custom") {
      const min = rec.min == null ? undefined : Number(rec.min);
      const max = rec.max == null ? undefined : Number(rec.max);
      out[k] = {
        kind: "custom",
        min: min != null && Number.isFinite(min) ? min : undefined,
        max: max != null && Number.isFinite(max) ? max : undefined,
      };
    }
  }
  return out;
}

function sanitizeColumns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CUSTOM_COLUMNS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !COLUMN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (!out.includes("symbol")) out.unshift("symbol");
  return out.length ? out : [...DEFAULT_CUSTOM_COLUMNS];
}

function sanitizePreset(raw: unknown): ScreenerPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.trim() === "") return null;
  const view = typeof p.view === "string" && VIEWS.has(p.view) ? (p.view as ScreenerView) : "overview";
  return {
    id: typeof p.id === "string" && p.id ? p.id : newId(),
    name: p.name.trim().slice(0, 40),
    signal: typeof p.signal === "string" && p.signal ? p.signal : null,
    filters: sanitizeFilters(p.filters),
    view,
    customColumns: sanitizeColumns(p.customColumns),
  };
}

export const BUILTIN_PRESETS: ScreenerPreset[] = [
  {
    id: "builtin-value",
    name: "Value",
    signal: null,
    filters: {
      Index: { kind: "preset", option: "S&P 500" },
      "Market Cap.": { kind: "preset", option: "+Large (over $10bln)" },
      "P/E": { kind: "preset", option: "Under 20" },
    },
    view: "valuation",
    customColumns: [...DEFAULT_CUSTOM_COLUMNS],
  },
  {
    id: "builtin-oversold",
    name: "Oversold",
    signal: "oversold",
    filters: {},
    view: "technical",
    customColumns: [...DEFAULT_CUSTOM_COLUMNS],
  },
  {
    id: "builtin-unusual",
    name: "Unusual Volume",
    signal: "unusual_volume",
    filters: {},
    view: "performance",
    customColumns: [...DEFAULT_CUSTOM_COLUMNS],
  },
  {
    id: "builtin-dividend",
    name: "Dividend",
    signal: null,
    filters: {
      Index: { kind: "preset", option: "S&P 500" },
      "Dividend Yield": { kind: "preset", option: "Over 3%" },
    },
    view: "financial",
    customColumns: [...DEFAULT_CUSTOM_COLUMNS],
  },
  {
    id: "builtin-sma200",
    name: "Above SMA200",
    signal: null,
    filters: {
      Index: { kind: "preset", option: "S&P 500" },
      "200-Day Simple Moving Average": { kind: "preset", option: "Price above SMA200" },
    },
    view: "technical",
    customColumns: [...DEFAULT_CUSTOM_COLUMNS],
  },
];

export function sanitizeScreener(persisted: unknown): PersistedScreener {
  const raw = (persisted ?? {}) as Record<string, unknown>;
  const pageSize = Number(raw.pageSize);
  const fetchLimit = Number(raw.fetchLimit);
  const presets: ScreenerPreset[] = [];
  if (Array.isArray(raw.presets)) {
    for (const p of raw.presets) {
      const clean = sanitizePreset(p);
      if (clean) presets.push(clean);
    }
  }
  return {
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 20,
    fetchLimit: [100, 250, 500, 1000].includes(fetchLimit) ? fetchLimit : DEFAULT_FETCH_LIMIT,
    customColumns: sanitizeColumns(raw.customColumns),
    presets,
  };
}

const storage = createJSONStorage<PersistedScreener>(() => backingStorage());

export const useScreener = create<ScreenerState>()(
  persist(
    (set, get) => ({
      pageSize: 20,
      fetchLimit: DEFAULT_FETCH_LIMIT,
      customColumns: [...DEFAULT_CUSTOM_COLUMNS],
      presets: [],

      setPageSize: (n) => {
        if ((PAGE_SIZES as readonly number[]).includes(n)) set({ pageSize: n });
      },
      setFetchLimit: (n) => {
        if ([100, 250, 500, 1000].includes(n)) set({ fetchLimit: n });
      },
      setCustomColumns: (ids) => set({ customColumns: sanitizeColumns(ids) }),
      savePreset: (p) => {
        const next: ScreenerPreset = {
          id: p.id ?? newId(),
          name: p.name.trim().slice(0, 40),
          signal: p.signal,
          filters: p.filters,
          view: p.view,
          customColumns: sanitizeColumns(p.customColumns),
        };
        const presets = get().presets.filter((x) => x.id !== next.id && x.name !== next.name);
        set({ presets: [...presets, next] });
      },
      deletePreset: (id) => set({ presets: get().presets.filter((p) => p.id !== id) }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      version: 1,
      partialize: ({ pageSize, fetchLimit, customColumns, presets }) => ({
        pageSize, fetchLimit, customColumns, presets,
      }),
      migrate: (persisted) => sanitizeScreener(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeScreener(persisted) }),
    },
  ),
);
