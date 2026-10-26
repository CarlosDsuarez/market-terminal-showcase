import { useEffect, useRef, useState } from "react";
import { parseCommand, FUNCTIONS, ALIASES, FN_BY_CODE } from "@/lib/functions";
import { useWorkspace } from "@/store/workspaceStore";
import { cn } from "@/lib/cn";

/** Closest function code/alias by edit distance — for "did you mean". */
function didYouMean(raw: string): string | null {
  const token = raw.trim().toUpperCase().split(/\s+/).pop() ?? "";
  if (token.length < 2) return null;
  const candidates = [...FUNCTIONS.map((f) => f.code), ...Object.keys(ALIASES)];
  let best: string | null = null;
  let bestDist = 3;
  for (const c of candidates) {
    const d = Math.abs(c.length - token.length);
    if (d >= bestDist) continue;
    const m = c.length;
    const n = token.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => i);
    for (let j = 1; j <= n; j++) {
      let prev = dp[0];
      dp[0] = j;
      for (let i = 1; i <= m; i++) {
        const cur = dp[i];
        dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (c[i - 1] === token[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    if (dp[m] < bestDist) {
      bestDist = dp[m];
      best = c;
    }
  }
  return bestDist <= 2 ? best : null;
}

export function CommandBar() {
  const [input, setInput] = useState("");
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { openTab, activeSymbol } = useWorkspace();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        const el = document.activeElement as HTMLElement | null;
        const typing = el && (
          /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable
        );
        if (typing) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Suggestions based on current token
  const tokens = input.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const suggestions = (() => {
    if (tokens.length === 0) return [];
    const seen = new Set<string>();
    const out = [];
    for (const f of FUNCTIONS) {
      if (!f.code.startsWith(last) || seen.has(f.code)) continue;
      seen.add(f.code);
      out.push(f);
    }
    for (const [alias, code] of Object.entries(ALIASES)) {
      if (!alias.startsWith(last)) continue;
      const f = FN_BY_CODE[code];
      if (!f || seen.has(f.code)) continue;
      seen.add(f.code);
      out.push(f);
    }
    return out.slice(0, 5);
  })();

  function run() {
    const raw = input.trim();
    if (!raw) return;
    const parsed = parseCommand(raw, activeSymbol);
    if (!parsed) {
      const hint = didYouMean(raw);
      setErr(hint ? `UNKNOWN COMMAND — DID YOU MEAN: ${hint}?` : "UNKNOWN COMMAND — TRY: HELP");
      return;
    }
    openTab(parsed.code, parsed.symbol);
    setHistory((h) => [raw.toUpperCase(), ...h].slice(0, 20));
    setHistIdx(null);
    setInput("");
    setErr(null);
  }

  return (
    <div className="flex items-center h-10 bg-term-panel border-b border-term-border px-3 gap-4">
      <div className="flex items-center gap-2 select-none shrink-0">
        <span className="w-1.5 h-1.5 bg-term-accent" />
        <span className="text-term-accent font-bold tracking-[0.15em] text-[11px] whitespace-nowrap">
          MARKET TERMINAL
        </span>
      </div>

      <div className="flex items-center gap-2 flex-1 relative">
        <label htmlFor="cmd-input" className="text-term-muted text-[11px] uppercase tracking-widest">CMD</label>
        <span className="text-term-accent" aria-hidden="true">{">"}</span>
        <input
          id="cmd-input"
          ref={inputRef}
          value={input}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="cmd-suggestions"
          aria-activedescendant={suggestions.length > 0 ? `cmd-opt-${suggestions[suggestIdx]?.code}` : undefined}
          aria-label="Terminal command"
          onChange={(e) => { setInput(e.target.value); setErr(null); setSuggestIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
            else if (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey || suggestions.length === 0)) {
              e.preventDefault();
              if (history.length === 0) return;
              const next = histIdx == null ? 0 : Math.min(history.length - 1, histIdx + 1);
              setHistIdx(next); setInput(history[next]);
            } else if (e.key === "ArrowDown" && (e.metaKey || e.ctrlKey || suggestions.length === 0)) {
              e.preventDefault();
              if (histIdx == null) return;
              const next = histIdx - 1;
              if (next < 0) { setHistIdx(null); setInput(""); }
              else { setHistIdx(next); setInput(history[next]); }
            } else if (e.key === "ArrowUp" && suggestions.length > 0) {
              e.preventDefault();
              setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "ArrowDown" && suggestions.length > 0) {
              e.preventDefault();
              setSuggestIdx((i) => (i + 1) % suggestions.length);
            } else if (e.key === "Escape") {
              setSuggestIdx(0);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Tab" && suggestions.length > 0) {
              e.preventDefault();
              const rest = tokens.slice(0, -1);
              setInput([...rest, suggestions[suggestIdx].code].join(" ") + " ");
            }
          }}
          placeholder="TRY:  AAPL   |   TSLA INTEL   |   AAPL,MSFT COMP   |   EQS   |   ALGO   |   HELP"
          spellCheck={false}
          autoCapitalize="characters"
          className="flex-1 bg-transparent uppercase text-term-heading placeholder:text-term-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-term-accent text-[13px] tracking-wider"
        />
        <button
          type="button"
          onClick={run}
          className="text-term-accent text-[11px] font-bold px-2 py-0.5 border border-term-accent hover:bg-term-accent hover:text-term-bg select-none"
        >
          RUN
        </button>

        {suggestions.length > 0 && (
          <div id="cmd-suggestions" role="listbox" aria-label="Function suggestions" className="absolute top-full left-24 mt-1 z-50 bg-term-panel border border-term-border min-w-[360px]">
            {suggestions.map((f, i) => (
              <button
                key={f.code}
                id={`cmd-opt-${f.code}`}
                role="option"
                aria-selected={i === suggestIdx}
                type="button"
                onMouseEnter={() => setSuggestIdx(i)}
                onClick={() => { setInput(f.code + " "); inputRef.current?.focus(); }}
                className={cn(
                  "w-full flex items-baseline gap-3 px-3 py-1.5 text-[12px] text-left",
                  i === suggestIdx && "bg-term-accent text-term-bg"
                )}
              >
                <span className={cn("font-bold w-14", i === suggestIdx ? "text-term-bg" : "text-term-heading")}>{f.code}</span>
                <span className={cn("flex-1", i === suggestIdx ? "text-term-bg" : "text-term-heading")}>{f.name}</span>
                <span className={cn("sub-header", i === suggestIdx && "text-term-bg/70")}>{f.group}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-term-muted">
        {err && <span className="text-term-red">{err}</span>}
        <span>CTX</span>
        <span className="text-term-heading font-bold">{activeSymbol ?? "—"}</span>
        <span className="text-term-muted">·</span>
        <span>↑↓ history   ⇥ autocomplete</span>
      </div>
    </div>
  );
}
