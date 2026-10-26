export function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = rows.map((r) => r.map((c) => csvEscape(c)).join(","));
  return [[...header.map((h) => csvEscape(h))].join(","), ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke async so the download has a chance to start (Safari needs this).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTextCsv(filename: string, header: string[], rows: (string | number | undefined | null)[][]) {
  const text = toCsv(
    header,
    rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
  );
  downloadCsv(filename, text);
}
