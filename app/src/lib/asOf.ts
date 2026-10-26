// The simulation clock.
//
// Held in a plain module rather than a store so lib/api.ts can read it without
// importing React state — the network layer must not depend on the UI layer.
// store/simStore.ts owns the writes and keeps this in sync.

let current: string | null = null;

/** The active simulation date, or null when the terminal is live. */
export const getAsOf = () => current;

export const setAsOfDate = (d: string | null) => { current = d; };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `new Date("2015-03-02")` is parsed as UTC midnight, which is the previous day
 * anywhere west of Greenwich — the same trap lib/format.ts documents. Build the
 * date in local time so stepping a day never silently loses one.
 */
export function parseIso(iso: string): Date {
  const p = DATE_ONLY.exec(iso);
  if (!p) return new Date(iso);
  return new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
}

/**
 * Format in local time. `toISOString().slice(0,10)` would report tomorrow's date
 * for any evening west of Greenwich, which is how an "as of" window quietly
 * drifts a day.
 */
export function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayIso = () => toIso(new Date());

/** What "now" means to the terminal: the simulation date, or today when live. */
export const anchorDate = () => (current ? parseIso(current) : new Date());

export const anchorIso = () => toIso(anchorDate());

/** True when the terminal is showing a past date rather than live data. */
export const isSimulating = () => current != null;
