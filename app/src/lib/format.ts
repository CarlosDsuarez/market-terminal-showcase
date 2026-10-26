export function fmtPrice(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString();
}

export function fmtVolume(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(2) + "K";
  return v.toString();
}

export function fmtPct(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return sign + v.toFixed(digits) + "%";
}

export function fmtPctFromDecimal(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return fmtPct(v * 100, digits);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `new Date("2026-07-30")` is parsed as UTC midnight, which renders as the
 * previous day west of Greenwich. Build date-only values in local time so a
 * fiscal period ending 2026-01-01 doesn't display as Dec 2025.
 */
function parseApiDate(iso: string): Date {
  const parts = DATE_ONLY.exec(iso);
  if (!parts) return new Date(iso);
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "2-digit" });
}

export function fmtTime(iso: string) {
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Spread between two rates given as normalized decimals (1% = 0.01), in basis points. */
export function spreadBps(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return (a - b) * 10_000;
}

export function fmtBps(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)} bps`;
}

export function dirClass(v: number | null | undefined): "up" | "down" | "flat" {
  if (v == null || Number.isNaN(v)) return "flat";
  return v >= 0 ? "up" : "down";
}
