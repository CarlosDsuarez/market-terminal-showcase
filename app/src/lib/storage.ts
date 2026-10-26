/**
 * Keeps persisted stores importable outside the browser (the unit tests run
 * under node), where touching `localStorage` would throw during hydration.
 */
export function backingStorage(): Storage {
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
