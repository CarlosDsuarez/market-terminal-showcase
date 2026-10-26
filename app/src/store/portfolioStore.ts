import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { backingStorage } from "@/lib/storage";
import { todayIso } from "@/lib/asOf";
import type { AlgoKind, AlgoOrder, Portfolio, Side, Trade } from "@/lib/portfolio";

export interface PersistedPortfolios {
  portfolios: Portfolio[];
  activeId: string;
}

export interface NewPortfolio {
  name: string;
  inceptionDate: string;
  initialCash: number;
  benchmark: string;
}

export type NewTrade = Omit<Trade, "id">;
export type NewAlgoOrder = Omit<AlgoOrder, "id" | "cancelledOn">;

const ALGO_KINDS: AlgoKind[] = ["TWAP", "VWAP", "POV", "ICEBERG"];

interface PortfolioState extends PersistedPortfolios {
  createPortfolio: (input: NewPortfolio) => string;
  deletePortfolio: (id: string) => void;
  setActive: (id: string) => void;
  addTrade: (portfolioId: string, t: NewTrade) => void;
  removeTrade: (portfolioId: string, tradeId: string) => void;
  clearTrades: (portfolioId: string) => void;
  addAlgoOrder: (portfolioId: string, o: NewAlgoOrder) => string;
  cancelAlgoOrder: (portfolioId: string, orderId: string, asOf: string) => void;
}

const STORAGE_KEY = "market-terminal-portfolios";

/** `crypto.randomUUID` is missing in older browsers and some test runners. */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeTrade(raw: unknown): Trade | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.symbol !== "string" || t.symbol.trim() === "") return null;
  if (typeof t.date !== "string" || !ISO.test(t.date)) return null;
  if (t.side !== "BUY" && t.side !== "SELL") return null;
  const quantity = Number(t.quantity);
  const price = Number(t.price);
  const fees = Number(t.fees ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return {
    id: typeof t.id === "string" && t.id ? t.id : newId(),
    date: t.date,
    symbol: t.symbol.toUpperCase(),
    side: t.side as Side,
    quantity,
    price,
    fees: Number.isFinite(fees) ? fees : 0,
    note: typeof t.note === "string" ? t.note : undefined,
    algoOrderId: typeof t.algoOrderId === "string" && t.algoOrderId ? t.algoOrderId : undefined,
  };
}

function optionalFinite(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeAlgoOrder(raw: unknown): AlgoOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.symbol !== "string" || o.symbol.trim() === "") return null;
  if (typeof o.created !== "string" || !ISO.test(o.created)) return null;
  if (typeof o.startDate !== "string" || !ISO.test(o.startDate)) return null;
  if (typeof o.endDate !== "string" || !ISO.test(o.endDate)) return null;
  if (o.side !== "BUY" && o.side !== "SELL") return null;
  if (typeof o.kind !== "string" || !ALGO_KINDS.includes(o.kind as AlgoKind)) return null;
  const quantity = Number(o.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const cancelledOn = typeof o.cancelledOn === "string" && ISO.test(o.cancelledOn) ? o.cancelledOn : undefined;
  const limit = optionalFinite(o.limit);
  const displayQty = optionalFinite(o.displayQty);
  const participation = optionalFinite(o.participation);
  return {
    id: typeof o.id === "string" && o.id ? o.id : newId(),
    created: o.created,
    symbol: o.symbol.toUpperCase(),
    side: o.side,
    quantity,
    kind: o.kind as AlgoKind,
    startDate: o.startDate,
    endDate: o.endDate,
    limit: limit != null && limit >= 0 ? limit : undefined,
    displayQty: displayQty != null && displayQty > 0 ? displayQty : undefined,
    participation: participation != null && participation > 0 ? participation : undefined,
    cancelledOn,
  };
}

function sanitizePortfolio(raw: unknown): Portfolio | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.trim() === "") return null;
  if (typeof p.inceptionDate !== "string" || !ISO.test(p.inceptionDate)) return null;
  const initialCash = Number(p.initialCash);
  if (!Number.isFinite(initialCash) || initialCash < 0) return null;
  const trades = Array.isArray(p.trades)
    ? p.trades.map(sanitizeTrade).filter((t): t is Trade => t !== null)
    : [];
  const algoOrders = Array.isArray(p.algoOrders)
    ? p.algoOrders.map(sanitizeAlgoOrder).filter((o): o is AlgoOrder => o !== null)
    : [];
  return {
    id: typeof p.id === "string" && p.id ? p.id : newId(),
    name: p.name,
    inceptionDate: p.inceptionDate,
    initialCash,
    benchmark: typeof p.benchmark === "string" && p.benchmark ? p.benchmark.toUpperCase() : "SPY",
    trades,
    algoOrders,
  };
}

/**
 * Persisted state is untrusted input. A single malformed trade must not take the
 * whole book down — and because the bad value is itself persisted, a crash here
 * would repeat on every reload until localStorage was cleared by hand. This
 * mirrors sanitizeWorkspace in store/workspaceStore.ts.
 */
export function sanitizePortfolios(persisted: unknown): PersistedPortfolios {
  const raw = (persisted ?? {}) as Record<string, unknown>;
  const portfolios = Array.isArray(raw.portfolios)
    ? raw.portfolios.map(sanitizePortfolio).filter((p): p is Portfolio => p !== null)
    : [];
  const activeId =
    typeof raw.activeId === "string" && portfolios.some((p) => p.id === raw.activeId)
      ? raw.activeId
      : portfolios[0]?.id ?? "";
  return { portfolios, activeId };
}

const storage = createJSONStorage<PersistedPortfolios>(() => backingStorage());

export const usePortfolios = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: [],
      activeId: "",

      createPortfolio: (input) => {
        const id = newId();
        const p: Portfolio = {
          id,
          name: input.name.trim() || "Untitled",
          // A portfolio that starts in the future would have no history to walk.
          inceptionDate: input.inceptionDate > todayIso() ? todayIso() : input.inceptionDate,
          initialCash: Math.max(0, input.initialCash),
          benchmark: (input.benchmark || "SPY").toUpperCase(),
          trades: [],
          algoOrders: [],
        };
        set({ portfolios: [...get().portfolios, p], activeId: id });
        return id;
      },

      deletePortfolio: (id) => {
        const remaining = get().portfolios.filter((p) => p.id !== id);
        set({
          portfolios: remaining,
          activeId: get().activeId === id ? remaining[0]?.id ?? "" : get().activeId,
        });
      },

      setActive: (id) => set({ activeId: id }),

      addTrade: (portfolioId, t) => set({
        portfolios: get().portfolios.map((p) =>
          p.id === portfolioId
            ? { ...p, trades: [...p.trades, { ...t, id: newId(), symbol: t.symbol.toUpperCase() }] }
            : p
        ),
      }),

      removeTrade: (portfolioId, tradeId) => set({
        portfolios: get().portfolios.map((p) =>
          p.id === portfolioId ? { ...p, trades: p.trades.filter((t) => t.id !== tradeId) } : p
        ),
      }),

      clearTrades: (portfolioId) => set({
        portfolios: get().portfolios.map((p) =>
          p.id === portfolioId ? { ...p, trades: [] } : p
        ),
      }),

      addAlgoOrder: (portfolioId, o) => {
        const id = newId();
        const order: AlgoOrder = {
          ...o,
          id,
          symbol: o.symbol.toUpperCase(),
        };
        set({
          portfolios: get().portfolios.map((p) =>
            p.id === portfolioId
              ? { ...p, algoOrders: [...(p.algoOrders ?? []), order] }
              : p
          ),
        });
        return id;
      },

      cancelAlgoOrder: (portfolioId, orderId, asOf) => set({
        portfolios: get().portfolios.map((p) => {
          if (p.id !== portfolioId) return p;
          return {
            ...p,
            algoOrders: (p.algoOrders ?? []).map((o) =>
              o.id === orderId && !o.cancelledOn ? { ...o, cancelledOn: asOf } : o
            ),
          };
        }),
      }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      version: 1,
      partialize: ({ portfolios, activeId }) => ({ portfolios, activeId }),
      migrate: (persisted) => sanitizePortfolios(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePortfolios(persisted) }),
    }
  )
);

/** The active portfolio, or undefined when none has been created yet. */
export function activePortfolio(state: PortfolioState): Portfolio | undefined {
  return state.portfolios.find((p) => p.id === state.activeId);
}
