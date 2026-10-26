import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspaceStore";
import { useSim } from "@/store/simStore";
import { cn } from "@/lib/cn";
import { IS_SYNTHETIC } from "@/lib/dataMode";

export function StatusBar() {
  const [apiOk, setApiOk] = useState<boolean | null>(IS_SYNTHETIC ? true : null);
  const tabs = useWorkspace((s) => s.tabs);
  const asOf = useSim((s) => s.asOf);
  const setAsOf = useSim((s) => s.setAsOf);

  useEffect(() => {
    if (IS_SYNTHETIC) return; // no backend to ping in the offline demo
    let alive = true;
    let ctrl: AbortController | null = null;
    const ping = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      try {
        const r = await fetch("/openapi.json", { signal });
        if (alive) setApiOk(r.ok);
      } catch (e) {
        if (alive && (e as { name?: string }).name !== "AbortError") setApiOk(false);
      }
    };
    ping();
    const t = setInterval(ping, 15000);
    return () => { alive = false; ctrl?.abort(); clearInterval(t); };
  }, []);

  return (
    // Mistaking a rewound terminal for a live one is the most expensive error
    // this feature can cause, so simulation gets the inverted treatment the rest
    // of the UI reserves for an active control — no colour needed to carry it.
    <div className={cn(
      "h-6 px-3 flex items-center justify-between border-t bg-term-panel2 text-[10px] uppercase tracking-[0.18em] text-term-muted",
      asOf ? "border-term-accent" : "border-term-border"
    )}>
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-2">
          <span className={
            apiOk == null ? "w-1.5 h-1.5 bg-term-muted"
            : apiOk ? "w-1.5 h-1.5 bg-term-heading"
            : "w-1.5 h-1.5 border border-term-heading"
          } />
          <span>
            {IS_SYNTHETIC
              ? <span className="text-term-heading font-bold">SYNTHETIC DATA — NOT REAL PRICES</span>
              : <>OPENBB {apiOk == null ? "…" : !apiOk ? "DOWN" : asOf ? "HISTORICAL" : "LIVE"}</>}
          </span>
        </span>
        <span>PROVIDER <span className="text-term-heading ml-1">{IS_SYNTHETIC ? "SEEDED GENERATOR" : "YFINANCE"}</span></span>
        <span>TABS <span className="text-term-text ml-1 num">{tabs.length}</span></span>
      </div>

      {asOf ? (
        <div className="flex items-center gap-3">
          <span className="bg-term-accent text-term-bg px-1.5 font-bold">SIMULATION</span>
          <span>
            AS OF <span className="num text-term-accentBright font-bold ml-1">{asOf}</span>
          </span>
          <button
            onClick={() => setAsOf(null)}
            className="px-2 py-px border border-term-accent text-term-accent hover:bg-term-accent hover:text-term-bg tracking-[0.18em]"
          >
            RETURN TO LIVE
          </button>
        </div>
      ) : (
        <Clock />
      )}
    </div>
  );
}

/** Owns the 1s tick so the rest of the bar doesn't re-render every second. */
function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-5 num">
      <span>{now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}</span>
      <span className="text-term-heading">{now.toLocaleTimeString()}</span>
    </div>
  );
}
