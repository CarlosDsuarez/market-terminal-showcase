import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { parseIso, setAsOfDate, toIso, todayIso } from "@/lib/asOf";
import { backingStorage } from "@/lib/storage";

export type StepUnit = "D" | "W" | "M" | "Y";

export interface PersistedSim {
  asOf: string | null;
}

interface SimState extends PersistedSim {
  /** Milliseconds per step while auto-replaying, or null when paused. */
  replaySpeed: number | null;
  setAsOf: (d: string | null) => void;
  advance: (unit: StepUnit, n: number) => void;
  startReplay: (ms: number) => void;
  stopReplay: () => void;
}

const STORAGE_KEY = "market-terminal-sim";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Persisted state is untrusted input. A malformed or future-dated value would
 * put the terminal in a simulation it cannot serve data for, and because the
 * bad value is itself persisted the problem would survive every reload.
 */
export function sanitizeSim(persisted: unknown): PersistedSim {
  const raw = (persisted ?? {}) as Record<string, unknown>;
  const asOf = raw.asOf;
  if (typeof asOf !== "string" || !ISO.test(asOf)) return { asOf: null };
  const parsed = parseIso(asOf);
  if (Number.isNaN(parsed.getTime())) return { asOf: null };
  // Date overflow is silent: "2015-02-30" parses to March 2. Round-tripping
  // catches it.
  if (toIso(parsed) !== asOf) return { asOf: null };
  // ISO dates sort lexicographically, so this is a plain string comparison.
  if (asOf > todayIso()) return { asOf: null };
  return { asOf };
}

/**
 * Step a date by calendar unit, clamped so the simulation never runs past today.
 * Month and year steps use the platform's own overflow rules, so 31 Jan + 1M
 * lands in March — acceptable for a date scrubber, and never silently invalid.
 */
export function step(iso: string, unit: StepUnit, n: number): string {
  const d = parseIso(iso);
  if (unit === "D") d.setDate(d.getDate() + n);
  else if (unit === "W") d.setDate(d.getDate() + n * 7);
  else if (unit === "M") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  const next = toIso(d);
  const today = todayIso();
  return next > today ? today : next;
}

const storage = createJSONStorage<PersistedSim>(() => backingStorage());

let replayTimer: ReturnType<typeof setInterval> | null = null;

export const useSim = create<SimState>()(
  persist(
    (set, get) => {
      /** Push the date everywhere it is read from. Query keys include asOf, so
       *  the cache is not cleared — a rewind reuses entries already fetched. */
      const apply = (next: string | null) => {
        setAsOfDate(next);
        set({ asOf: next });
      };

      return {
        asOf: null,
        replaySpeed: null,

        setAsOf: (d) => {
          // An explicit date change is a user action, so it also ends a replay.
          get().stopReplay();
          if (d == null) { apply(null); return; }
          apply(d > todayIso() ? todayIso() : d);
        },

        // Stepping while live starts the clock at today rather than jumping into
        // the future, so "+1D" from LIVE is a no-op instead of an invalid date.
        advance: (unit, n) => apply(step(get().asOf ?? todayIso(), unit, n)),

        startReplay: (ms) => {
          if (replayTimer) clearInterval(replayTimer);
          replayTimer = setInterval(() => {
            const s = useSim.getState();
            if (s.asOf == null || s.asOf >= todayIso()) { s.stopReplay(); return; }
            s.advance("D", 1);
          }, ms);
          set({ replaySpeed: ms });
        },

        stopReplay: () => {
          if (replayTimer) clearInterval(replayTimer);
          replayTimer = null;
          set({ replaySpeed: null });
        },
      };
    },
    {
      name: STORAGE_KEY,
      storage,
      version: 1,
      partialize: ({ asOf }) => ({ asOf }),
      migrate: (persisted) => sanitizeSim(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeSim(persisted) }),
      // Rehydration writes the store but not the plain module lib/api.ts reads,
      // so without this a reload would restore the banner and leave the data live.
      onRehydrateStorage: () => (state) => {
        if (state) setAsOfDate(state.asOf);
      },
    }
  )
);
