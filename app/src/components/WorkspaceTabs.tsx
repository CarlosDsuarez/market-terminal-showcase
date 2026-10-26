import { useRef } from "react";
import { X } from "lucide-react";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

export function WorkspaceTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspace();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /** Roving-tabindex arrow navigation, per the ARIA tabs pattern. */
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setActiveTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Open functions"
      className="flex h-7 bg-term-bg2 border-b border-term-border overflow-x-auto scroll-thin"
    >
      {tabs.map((t, i) => {
        const isActive = t.id === activeTabId;
        const label = t.symbol ? `${t.symbol} · ${t.code}` : t.code;
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 h-full px-3 border-r border-term-border text-[11px] tracking-wider uppercase whitespace-nowrap",
              isActive
                ? "bg-term-accent text-term-bg"
                : "text-term-muted hover:text-term-text hover:bg-term-accentSubtle"
            )}
          >
            <button
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              // Only the active tab is a tab stop; arrows move between them.
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="font-semibold h-full"
            >
              {label}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                aria-label={`Close ${label}`}
                onClick={() => closeTab(t.id)}
                className={cn("opacity-40 hover:opacity-100", isActive ? "hover:text-term-bg" : "hover:text-term-text")}
              >
                <X size={11} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
