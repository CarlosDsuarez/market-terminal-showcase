import { useWorkspace } from "@/store/workspaceStore";
import { FN_BY_CODE, type FunctionCode } from "@/lib/functions";
import { cn } from "@/lib/cn";

interface Btn { code: FunctionCode; label: string; }

const BUTTONS: Btn[] = [
  { code: "CC",     label: "Home" },
  { code: "PSIM",   label: "Time Machine" },
  { code: "PORT",   label: "Portfolio" },
  { code: "TRADE",  label: "Blotter" },
  { code: "ALGO",   label: "Algos" },
  { code: "PERF",   label: "Performance" },
  { code: "RISK",   label: "Risk" },
  { code: "WATCH",  label: "Watchlist" },
  { code: "SCR",    label: "Screener" },
  { code: "CORR",   label: "Correlation" },
  { code: "COMP",   label: "Compare" },
  { code: "BT",     label: "Backtest" },
  { code: "INTEL",  label: "Intel" },
  { code: "GP",     label: "Chart" },
  { code: "TECH",   label: "Technicals" },
  { code: "KEY",    label: "Ratios" },
  { code: "FA",     label: "Financials" },
  { code: "OMON",   label: "Options" },
  { code: "NI",     label: "News" },
  { code: "MOV",    label: "Movers" },
  { code: "WEI",    label: "Global" },
  { code: "CRYPTO", label: "Crypto" },
  { code: "FXC",    label: "FX" },
  { code: "CURV",   label: "Yields" },
  { code: "HELP",   label: "Help" },
];

export function QuickBar() {
  const { openTab, activeSymbol, tabs, activeTabId } = useWorkspace();
  const activeCode = tabs.find((t) => t.id === activeTabId)?.code;

  return (
    <div className="flex items-stretch h-9 bg-term-bg2 border-b border-term-border overflow-x-auto scroll-thin">
      <span className="hidden sm:flex items-center px-3 sub-header shrink-0 border-r border-term-border">
        QUICK
      </span>
      {BUTTONS.map((b) => {
        const fn = FN_BY_CODE[b.code];
        const isActive = b.code === activeCode;
        const needsSymbol = fn.needsSymbol;
        const title = needsSymbol
          ? `${b.code} — ${fn.name} · uses CTX ${activeSymbol ?? "AAPL"}`
          : `${b.code} — ${fn.name}`;
        return (
          <button
            key={b.code}
            title={title}
            onClick={() => openTab(b.code, needsSymbol ? (activeSymbol ?? "AAPL") : undefined)}
            className={cn(
              "group flex flex-col items-center justify-center px-3 py-1 border-r border-term-border shrink-0 min-w-[78px]",
              isActive
                ? "bg-term-accent text-term-bg"
                : "hover:bg-term-panel2 text-term-muted hover:text-term-text"
            )}
          >
            <span className={cn(
              "text-[11px] font-bold tracking-[0.12em]",
              isActive ? "text-term-bg" : "text-term-heading/70 group-hover:text-term-accent"
            )}>
              {b.code}
            </span>
            <span className={cn(
              "text-[9px] uppercase tracking-[0.15em]",
              isActive ? "text-term-bg/70" : "text-term-muted group-hover:text-term-text"
            )}>
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
