import type { ColumnDef } from "./catalog";
import { fmtDate, fmtPct, fmtPrice, fmtVolume } from "@/lib/format";
import { rowNumber, rowText, type ScreenerRow } from "./query";
import { csvEscape, downloadCsv as downloadCsvFile } from "@/lib/export";

export function formatCell(col: ColumnDef, row: ScreenerRow): { text: string; dir?: "up" | "down" } {
  const keys = [col.id, ...(col.keys ?? [])];
  if (col.format === "text" || col.format === "date") {
    const s = rowText(row, keys);
    if (s == null) return { text: "—" };
    return { text: col.format === "date" ? (fmtDate(s) === "—" ? s : fmtDate(s)) : s };
  }
  const n = rowNumber(row, keys);
  if (n == null) return { text: "—" };
  const dir = col.signed ? (n > 0 ? "up" as const : n < 0 ? "down" as const : undefined) : undefined;
  switch (col.format) {
    case "price":
      return { text: fmtPrice(n), dir };
    case "vol":
      return { text: fmtVolume(n), dir };
    case "ratio":
    case "beta":
      return { text: n.toFixed(2), dir };
    case "rsi":
      return { text: n.toFixed(1), dir };
    case "int":
      return { text: Math.round(n).toLocaleString(), dir };
    case "pctDec":
      return { text: fmtPct(n * 100), dir };
    default:
      return { text: String(n), dir };
  }
}

export function rowsToCsv(rows: ScreenerRow[], columns: ColumnDef[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => {
      const text = formatCell(c, row).text;
      return csvEscape(text === "—" ? "" : text);
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  downloadCsvFile(filename, csv);
}
