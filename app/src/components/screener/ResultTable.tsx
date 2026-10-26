import { memo } from "react";
import type { ColumnDef } from "@/lib/screener/catalog";
import { formatCell } from "@/lib/screener/format";
import type { ScreenerRow } from "@/lib/screener/query";
import { cn } from "@/lib/cn";

interface Props {
  rows: ScreenerRow[];
  columns: ColumnDef[];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (id: string) => void;
  selected: Set<string>;
  onToggle: (symbol: string) => void;
  onOpen: (symbol: string) => void;
  onWatch: (symbol: string) => void;
  offset: number;
}

export const ResultTable = memo(function ResultTable({
  rows, columns, sortKey, sortDir, onSort, selected, onToggle, onOpen, onWatch, offset,
}: Props) {
  return (
    <div className="overflow-auto scroll-thin flex-1 min-h-0">
      <table className="w-full grid-data text-[12px]">
        <thead>
          <tr>
            <th className="w-6" />
            <th className="w-8">#</th>
            {columns.map((c) => (
              <th
                key={c.id}
                className={cn("cursor-pointer hover:text-term-accent", c.format !== "text" && c.format !== "date" && "text-right")}
                onClick={() => onSort(c.id)}
              >
                {c.label}
                {sortKey === c.id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <BodyRow
              key={String(row.symbol ?? "") || i}
              row={row}
              columns={columns}
              index={offset + i + 1}
              checked={selected.has(String(row.symbol ?? ""))}
              onToggle={onToggle}
              onOpen={onOpen}
              onWatch={onWatch}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 3} className="p-4 text-center text-term-muted">
                Nothing passes these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

const BodyRow = memo(function BodyRow({
  row, columns, index, checked, onToggle, onOpen, onWatch,
}: {
  row: ScreenerRow;
  columns: ColumnDef[];
  index: number;
  checked: boolean;
  onToggle: (symbol: string) => void;
  onOpen: (symbol: string) => void;
  onWatch: (symbol: string) => void;
}) {
  const sym = String(row.symbol ?? "");
  return (
    <tr className="cursor-pointer" onClick={() => sym && onOpen(sym)}>
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(sym)}
          disabled={!sym}
        />
      </td>
      <td className="num text-term-muted">{index}</td>
      {columns.map((c) => {
        const cell = formatCell(c, row);
        const isSym = c.id === "symbol";
        return (
          <td
            key={c.id}
            className={cn(
              "num",
              c.format !== "text" && c.format !== "date" && "text-right",
              isSym && "text-term-amber font-semibold",
              cell.dir === "up" && "up",
              cell.dir === "down" && "down",
            )}
          >
            {cell.text}
          </td>
        );
      })}
      <td className="text-right" onClick={(e) => e.stopPropagation()}>
        {sym && (
          <button
            onClick={() => onWatch(sym)}
            className="text-term-muted hover:text-term-accent text-[10px] tracking-wider"
          >
            + WATCH
          </button>
        )}
      </td>
    </tr>
  );
});
