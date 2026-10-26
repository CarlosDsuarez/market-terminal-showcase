import { FILTER_FIELDS, filterByKey, type ScreenerMetric } from "./catalog";

export type FilterValue =
  | { kind: "preset"; option: string }
  | { kind: "custom"; min?: number; max?: number };

export type FilterMap = Record<string, FilterValue>;

export interface ScreenInput {
  metric: ScreenerMetric;
  signal: string | null;
  filters: FilterMap;
  limit: number;
}

export interface ScreenerRequest {
  metric: ScreenerMetric;
  signal?: string;
  filters_dict?: string;
  limit: number;
}

export type ScreenerRow = Record<string, unknown> & { symbol?: string; name?: string };

const SUFFIX: Record<string, number> = {
  K: 1e3, M: 1e6, B: 1e9, BLN: 1e9, MLN: 1e6,
};

function scaleSuffix(raw: string | undefined): number {
  if (!raw) return 1;
  return SUFFIX[raw.toUpperCase()] ?? 1;
}

export interface Bounds { min?: number; max?: number }

/** Parse a Finviz dropdown label into numeric bounds when it has any. */
export function parseOptionBounds(option: string): Bounds | null {
  const s = option.trim();

  const closed = /^(?:\$)?(-?[\d.]+)\s*(K|M|B|bln|mln)?\s+to\s+(?:\$)?(-?[\d.]+)\s*(K|M|B|bln|mln)?$/i.exec(s);
  if (closed) {
    return {
      min: Number(closed[1]) * scaleSuffix(closed[2]),
      max: Number(closed[3]) * scaleSuffix(closed[4]),
    };
  }

  const under = /^(?:Under|Low)\s+(?:\(\s*<\s*)?(?:\$)?(-?[\d.]+)\s*(K|M|B|%|bln|mln)?/i.exec(s);
  if (under) return { max: Number(under[1]) * scaleSuffix(under[2]) };

  const over = /^(?:Over|High)\s+(?:\(\s*>\s*)?(?:\+)?(?:\$)?(-?[\d.]+)\s*(K|M|B|%|bln|mln)?/i.exec(s);
  if (over) return { min: Number(over[1]) * scaleSuffix(over[2]) };

  const ineq = /(?:Positive|Negative|Very Positive|Very Negative)\s+\(\s*([<>]=?)\s*(-?[\d.]+)/i.exec(s);
  if (ineq) {
    const n = Number(ineq[2]);
    return ineq[1].includes("<") ? { max: n } : { min: n };
  }

  return null;
}

function width(b: Bounds): number {
  const lo = b.min ?? Number.NEGATIVE_INFINITY;
  const hi = b.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return Number.POSITIVE_INFINITY;
  return hi - lo;
}

function covers(option: Bounds, want: Bounds): boolean {
  const oLo = option.min ?? Number.NEGATIVE_INFINITY;
  const oHi = option.max ?? Number.POSITIVE_INFINITY;
  const wLo = want.min ?? Number.NEGATIVE_INFINITY;
  const wHi = want.max ?? Number.POSITIVE_INFINITY;
  return oLo <= wLo && oHi >= wHi;
}

export function coveringPreset(filterKey: string, want: Bounds): string | undefined {
  const filter = filterByKey(filterKey);
  if (!filter) return undefined;
  const candidates: { option: string; bounds: Bounds }[] = [];
  for (const option of filter.options) {
    const bounds = parseOptionBounds(option);
    if (!bounds) continue;
    if (covers(bounds, want)) candidates.push({ option, bounds });
  }
  if (candidates.length === 0) return undefined;
  const minOnly = want.min != null && want.max == null;
  const maxOnly = want.max != null && want.min == null;
  candidates.sort((a, b) => {
    if (minOnly) return (b.bounds.min ?? Number.NEGATIVE_INFINITY) - (a.bounds.min ?? Number.NEGATIVE_INFINITY);
    if (maxOnly) return (a.bounds.max ?? Number.POSITIVE_INFINITY) - (b.bounds.max ?? Number.POSITIVE_INFINITY);
    return width(a.bounds) - width(b.bounds);
  });
  return candidates[0].option;
}

function isActivePreset(v: FilterValue): v is { kind: "preset"; option: string } {
  return v.kind === "preset" && v.option.trim() !== "" && v.option !== "Any";
}

export function buildScreenerRequest(input: ScreenInput): ScreenerRequest {
  const dict: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.filters)) {
    if (isActivePreset(value)) {
      dict[key] = value.option;
      continue;
    }
    if (value.kind === "custom") {
      const bucket = coveringPreset(key, { min: value.min, max: value.max });
      if (bucket) dict[key] = bucket;
    }
  }
  const hasFilters = Object.keys(dict).length > 0;
  const signal = input.signal && input.signal !== "none" ? input.signal : undefined;
  return {
    metric: input.metric,
    signal: signal ?? (hasFilters ? undefined : "top_gainers"),
    filters_dict: hasFilters ? JSON.stringify(dict) : undefined,
    limit: input.limit,
  };
}

function numFrom(row: ScreenerRow, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && v !== "-") {
      const n = Number(v.replace(/%/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export function applyCustomFilters(rows: ScreenerRow[], filters: FilterMap): ScreenerRow[] {
  const customs = Object.entries(filters).filter(([, v]) => v.kind === "custom") as [string, Extract<FilterValue, { kind: "custom" }>][];
  if (customs.length === 0) return rows;
  return rows.filter((row) => {
    for (const [key, range] of customs) {
      const field = FILTER_FIELDS[key];
      if (!field) continue;
      const raw = numFrom(row, field.keys);
      if (raw == null) return false;
      if (range.min != null && !(raw >= range.min * field.scale)) return false;
      if (range.max != null && !(raw <= range.max * field.scale)) return false;
    }
    return true;
  });
}

/**
 * finvizfinance currently concatenates Finviz's split first-letter cell, so
 * NVDA arrives as NNVDA. Only rewrite a batch when the duplication is the
 * majority — otherwise a real AAPL would become APL.
 */
export function normalizeScreenerSymbols<T extends { symbol?: string }>(rows: T[]): T[] {
  const syms = rows.map((r) => r.symbol).filter((s): s is string => typeof s === "string" && s.length >= 2);
  if (syms.length === 0) return rows;
  const doubled = syms.filter((s) => s[0] === s[1]).length;
  if (doubled / syms.length < 0.8) return rows;
  return rows.map((r) => {
    const s = r.symbol;
    if (!s || s.length < 2 || s[0] !== s[1]) return r;
    return { ...r, symbol: s.slice(1) };
  });
}

export function rowNumber(row: ScreenerRow, keys: string[]): number | undefined {
  return numFrom(row, keys);
}

export function rowText(row: ScreenerRow, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return undefined;
}

export function mergeRowsBySymbol(parts: ScreenerRow[][]): ScreenerRow[] {
  const map = new Map<string, ScreenerRow>();
  const order: string[] = [];
  for (const rows of parts) {
    for (const row of rows) {
      const sym = row.symbol;
      if (!sym) continue;
      const prev = map.get(sym);
      if (!prev) {
        map.set(sym, { ...row });
        order.push(sym);
      } else {
        map.set(sym, { ...prev, ...row, symbol: sym, name: (prev.name ?? row.name) as string | undefined });
      }
    }
  }
  return order.map((s) => map.get(s)!);
}

export function activeFilterCount(filters: FilterMap, signal: string | null): number {
  let n = signal && signal !== "none" ? 1 : 0;
  for (const v of Object.values(filters)) {
    if (isActivePreset(v)) n++;
    else if (v.kind === "custom" && (v.min != null || v.max != null)) n++;
  }
  return n;
}

export function emptyFilters(): FilterMap {
  return {};
}
