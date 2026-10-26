import { lazy, Suspense, useMemo } from "react";
import { CommandBar } from "@/components/CommandBar";
import { QuickBar } from "@/components/QuickBar";
import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { StatusBar } from "@/components/StatusBar";
import { FunctionPanel } from "@/components/FunctionPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWorkspace } from "@/store/workspaceStore";
import { FUNCTIONS, type FunctionCode } from "@/lib/functions";

/**
 * Screens load on first open, not on boot: the initial bundle skips
 * lightweight-charts and the screener until their tab is actually visited.
 * Declared once at module level so switching tabs never recreates them.
 */
const SCREENS: Record<FunctionCode, React.LazyExoticComponent<(p: { symbol?: string }) => JSX.Element>> = {
  CC: lazy(() => import("@/functions/CC").then((m) => ({ default: () => <m.CC /> }))),
  INTEL: lazy(() => import("@/functions/INTEL").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.INTEL symbol={symbol!} /> }))),
  HELP: lazy(() => import("@/functions/HELP").then((m) => ({ default: () => <m.HELP /> }))),
  PSIM: lazy(() => import("@/functions/PSIM").then((m) => ({ default: () => <m.PSIM /> }))),
  PORT: lazy(() => import("@/functions/PORT").then((m) => ({ default: () => <m.PORT /> }))),
  TRADE: lazy(() => import("@/functions/TRADE").then((m) => ({ default: () => <m.TRADE /> }))),
  ALGO: lazy(() => import("@/functions/ALGO").then((m) => ({ default: () => <m.ALGO /> }))),
  PERF: lazy(() => import("@/functions/PERF").then((m) => ({ default: () => <m.PERF /> }))),
  RISK: lazy(() => import("@/functions/RISK").then((m) => ({ default: () => <m.RISK /> }))),
  // These take an optional comma-joined symbol list: "AAPL,MSFT,NVDA COMP".
  BT: lazy(() => import("@/functions/BT").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.BT symbol={symbol} /> }))),
  CORR: lazy(() => import("@/functions/CORR").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.CORR symbol={symbol} /> }))),
  COMP: lazy(() => import("@/functions/COMP").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.COMP symbol={symbol} /> }))),
  SCR: lazy(() => import("@/functions/SCR").then((m) => ({ default: () => <m.SCR /> }))),
  WATCH: lazy(() => import("@/functions/WATCH").then((m) => ({ default: () => <m.WATCH /> }))),
  DES: lazy(() => import("@/functions/DES").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.DES symbol={symbol!} /> }))),
  GP: lazy(() => import("@/functions/GP").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.GP symbol={symbol!} /> }))),
  TECH: lazy(() => import("@/functions/TECH").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.TECH symbol={symbol!} /> }))),
  QR: lazy(() => import("@/functions/QR").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.QR symbol={symbol!} /> }))),
  HP: lazy(() => import("@/functions/HP").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.HP symbol={symbol!} /> }))),
  FA: lazy(() => import("@/functions/FA").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.FA symbol={symbol!} /> }))),
  KEY: lazy(() => import("@/functions/KEY").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.KEY symbol={symbol!} /> }))),
  DVD: lazy(() => import("@/functions/DVD").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.DVD symbol={symbol!} /> }))),
  EE: lazy(() => import("@/functions/EE").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.EE symbol={symbol!} /> }))),
  NI: lazy(() => import("@/functions/NI").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.NI symbol={symbol!} /> }))),
  WEI: lazy(() => import("@/functions/WEI").then((m) => ({ default: () => <m.WEI /> }))),
  MOV: lazy(() => import("@/functions/MOV").then((m) => ({ default: () => <m.MOV /> }))),
  OMON: lazy(() => import("@/functions/OMON").then((m) => ({ default: ({ symbol }: { symbol?: string }) => <m.OMON symbol={symbol!} /> }))),
  CURV: lazy(() => import("@/functions/CURV").then((m) => ({ default: () => <m.CURV /> }))),
  FXC: lazy(() => import("@/functions/FXC").then((m) => ({ default: () => <m.FXC /> }))),
  CRYPTO: lazy(() => import("@/functions/CRYPTO").then((m) => ({ default: () => <m.CRYPTO /> }))),
};

export default function App() {
  const { tabs, activeTabId } = useWorkspace();
  const active = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const Screen = active ? SCREENS[active.code] : null;

  return (
    <div className="h-screen flex flex-col">
      <CommandBar />
      <QuickBar />
      <WorkspaceTabs />
      <div className="flex-1 min-h-0 p-1 flex">
        {active && Screen && (
          <FunctionPanel code={active.code} symbol={active.symbol}>
            <ErrorBoundary resetKey={active.id}>
              <Suspense fallback={<div className="p-4 text-term-muted uppercase text-[11px] tracking-widest">Loading {active.code}…</div>}>
                <Screen symbol={active.symbol} />
              </Suspense>
            </ErrorBoundary>
          </FunctionPanel>
        )}
      </div>
      <StatusBar />
    </div>
  );
}

// Ensure FUNCTIONS is kept (for autocomplete discovery)
void FUNCTIONS;
