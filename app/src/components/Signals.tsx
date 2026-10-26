// Shared presentation for rule-based signals. Extracted from INTEL so TECH and
// the portfolio screens render an identical signal row rather than each growing
// their own near-copy.
//
// Colour comes from levelColor/levelDot in lib/signals.ts, which is where the
// black-and-white palette decides how a bull, bear or neutral read looks. A
// signal is a judgement, not a price move, so it carries no red or green.

import { type ReactNode } from "react";
import { levelColor, levelDot, tally, type Signal } from "@/lib/signals";
import { cn } from "@/lib/cn";

export function SignalRow({ s }: { s: Signal }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-2 h-2 shrink-0", levelDot(s.level))} />
      <span className={cn("flex-1", levelColor(s.level))}>{s.label}</span>
      {s.detail && <span className="num text-term-muted text-[11px]">{s.detail}</span>}
    </div>
  );
}

export function SignalGroup({ title, signals }: { title: string; signals: Signal[] }) {
  const t = tally(signals);
  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title}</span>
        <span className="text-[10px] normal-case tracking-normal font-normal">
          <span className="text-term-heading num">{t.bull}</span>
          <span className="text-term-muted mx-1">·</span>
          <span className="text-term-muted num">{t.neutral}</span>
          <span className="text-term-muted mx-1">·</span>
          <span className="text-term-text num">{t.bear}</span>
        </span>
      </div>
      <div className="p-1 flex flex-col gap-2">
        {signals.map((s, i) => <SignalRow key={i} s={s} />)}
      </div>
    </div>
  );
}

/** Label/value pair for the two-column readouts inside a panel. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <div className="sub-header py-0.5">{k}</div>
      <div className="num text-right py-0.5">{v}</div>
    </>
  );
}
