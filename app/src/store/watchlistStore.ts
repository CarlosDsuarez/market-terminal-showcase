import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { backingStorage } from "@/lib/storage";

export interface PersistedWatchlist {
  symbols: string[];
}

interface WatchlistState extends PersistedWatchlist {
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  toggle: (symbol: string) => void;
  addMany: (symbols: string[]) => void;
  clear: () => void;
}

const STORAGE_KEY = "market-terminal-watchlist";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"];

/** Keep the list small enough that one batched request stays fast. */
const MAX_SYMBOLS = 30;

export function sanitizeWatchlist(persisted: unknown): PersistedWatchlist {
  const raw = (persisted ?? {}) as Record<string, unknown>;
  if (!Array.isArray(raw.symbols)) return { symbols: DEFAULT_SYMBOLS };
  const seen = new Set<string>();
  for (const s of raw.symbols) {
    if (typeof s !== "string") continue;
    const sym = s.trim().toUpperCase();
    if (sym === "" || seen.has(sym)) continue;
    seen.add(sym);
    if (seen.size >= MAX_SYMBOLS) break;
  }
  return { symbols: [...seen] };
}

const storage = createJSONStorage<PersistedWatchlist>(() => backingStorage());

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      symbols: DEFAULT_SYMBOLS,

      add: (symbol) => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) return;
        const { symbols } = get();
        if (symbols.includes(sym) || symbols.length >= MAX_SYMBOLS) return;
        set({ symbols: [...symbols, sym] });
      },

      remove: (symbol) =>
        set({ symbols: get().symbols.filter((s) => s !== symbol.toUpperCase()) }),

      toggle: (symbol) => {
        const sym = symbol.trim().toUpperCase();
        if (get().symbols.includes(sym)) get().remove(sym);
        else get().add(sym);
      },

      addMany: (incoming) => {
        const next = [...get().symbols];
        for (const s of incoming) {
          const sym = s.trim().toUpperCase();
          if (!sym || next.includes(sym) || next.length >= MAX_SYMBOLS) continue;
          next.push(sym);
        }
        set({ symbols: next });
      },

      clear: () => set({ symbols: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      version: 1,
      partialize: ({ symbols }) => ({ symbols }),
      migrate: (persisted) => sanitizeWatchlist(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeWatchlist(persisted) }),
    }
  )
);
