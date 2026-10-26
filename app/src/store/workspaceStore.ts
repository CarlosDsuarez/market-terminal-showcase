import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FN_BY_CODE, type FunctionCode } from "@/lib/functions";

export interface Tab {
  id: string;
  code: FunctionCode;
  symbol?: string;
}

export interface PersistedWorkspace {
  tabs: Tab[];
  activeTabId: string;
  activeSymbol: string;
}

interface WorkspaceState extends PersistedWorkspace {
  openTab: (code: FunctionCode, symbol?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setActiveSymbol: (s: string) => void;
}

const STORAGE_KEY = "market-terminal-workspace";

/** Workspaces saved by the BBterminal builds that preceded the rename. */
const LEGACY_STORAGE_KEY = "bbterminal-workspace";

export const HOME_TAB: Tab = { id: "CC:_", code: "CC" };
const DEFAULT_SYMBOL = "AAPL";

const tabId = (code: string, symbol?: string) => `${code}:${symbol ?? "_"}`;

/**
 * A persisted tab whose function code no longer exists makes FunctionPanel read
 * `.name` off undefined and throw on first render. Because the bad tab is itself
 * persisted, the crash then repeats on every reload and only clearing
 * localStorage by hand recovers. So treat stored state as untrusted input and
 * drop anything unrecognisable rather than rehydrating it.
 */
export function sanitizeWorkspace(persisted: unknown): PersistedWorkspace {
  const raw = (persisted ?? {}) as Record<string, unknown>;

  const tabs: Tab[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.tabs)) {
    for (const entry of raw.tabs) {
      if (!entry || typeof entry !== "object") continue;
      const { id, code, symbol } = entry as Record<string, unknown>;
      if (typeof code !== "string" || !(code in FN_BY_CODE)) continue;
      if (symbol != null && typeof symbol !== "string") continue;
      const sym = typeof symbol === "string" ? symbol.toUpperCase() : undefined;
      const resolvedId = typeof id === "string" && id.length > 0 ? id : tabId(code, sym);
      if (seen.has(resolvedId)) continue;
      seen.add(resolvedId);
      tabs.push({ id: resolvedId, code: code as FunctionCode, symbol: sym });
    }
  }
  if (tabs.length === 0) tabs.push(HOME_TAB);

  const activeTabId =
    typeof raw.activeTabId === "string" && tabs.some((t) => t.id === raw.activeTabId)
      ? raw.activeTabId
      : tabs[0].id;

  const activeSymbol =
    typeof raw.activeSymbol === "string" && raw.activeSymbol.trim().length > 0
      ? raw.activeSymbol.toUpperCase()
      : DEFAULT_SYMBOL;

  return { tabs, activeTabId, activeSymbol };
}

/**
 * Keeps the module importable outside the browser (the unit tests run under
 * node), where touching `localStorage` would throw during hydration.
 */
function backingStorage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Blocked by a privacy setting — fall through to the in-memory shim.
  }
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (k) => mem.get(k) ?? null,
    key: (i) => Array.from(mem.keys())[i] ?? null,
    removeItem: (k) => void mem.delete(k),
    setItem: (k, v) => void mem.set(k, v),
  };
}

const storage = createJSONStorage<PersistedWorkspace>(() => {
  const backing = backingStorage();
  return {
    getItem: (name) => backing.getItem(name) ?? backing.getItem(LEGACY_STORAGE_KEY),
    setItem: (name, value) => {
      backing.setItem(name, value);
      // The legacy blob has been adopted; retire it so it can't come back.
      backing.removeItem(LEGACY_STORAGE_KEY);
    },
    removeItem: (name) => {
      backing.removeItem(name);
      backing.removeItem(LEGACY_STORAGE_KEY);
    },
  };
});

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [HOME_TAB],
      activeTabId: HOME_TAB.id,
      activeSymbol: DEFAULT_SYMBOL,
      openTab: (code, symbol) => {
        const s = symbol?.toUpperCase();
        const id = tabId(code, s);
        const { tabs } = get();
        const existing = tabs.find((t) => t.id === id);
        if (existing) {
          set({ activeTabId: id, activeSymbol: s ?? get().activeSymbol });
        } else {
          set({
            tabs: [...tabs, { id, code, symbol: s }],
            activeTabId: id,
            activeSymbol: s ?? get().activeSymbol,
          });
        }
      },
      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const remaining = tabs.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          // always keep Command Center open as a fallback
          set({ tabs: [HOME_TAB], activeTabId: HOME_TAB.id });
          return;
        }
        set({
          tabs: remaining,
          activeTabId:
            activeTabId === id ? remaining[remaining.length - 1].id : activeTabId,
        });
      },
      setActiveTab: (id) => set({ activeTabId: id }),
      setActiveSymbol: (s) => set({ activeSymbol: s.toUpperCase() }),
    }),
    {
      name: STORAGE_KEY,
      storage,
      version: 1,
      partialize: ({ tabs, activeTabId, activeSymbol }) => ({
        tabs,
        activeTabId,
        activeSymbol,
      }),
      migrate: (persisted) => sanitizeWorkspace(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeWorkspace(persisted) }),
    }
  )
);
