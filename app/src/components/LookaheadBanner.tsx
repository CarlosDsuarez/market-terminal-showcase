import { useSim } from "@/store/simStore";
import { todayIso } from "@/lib/asOf";

/**
 * The honest half of simulation mode.
 *
 * Yahoo/OpenBB serve only *current* fundamentals, analyst targets, news and
 * options chains — there is no point-in-time version at any provider tier this
 * terminal uses. Rather than quietly dressing today's numbers up as history,
 * screens that cannot rewind say so, loudly, every time.
 */
export function LookaheadBanner() {
  const asOf = useSim((s) => s.asOf);
  if (asOf == null) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b-2 border-term-red bg-term-red/10 text-[11px]">
      <span className="text-term-red font-bold tracking-[0.2em] shrink-0">⚠ LOOKAHEAD</span>
      <span className="text-term-text">
        This screen is showing <span className="num text-term-red font-bold">today&apos;s</span> data
        (<span className="num">{todayIso()}</span>), not{" "}
        <span className="num text-term-amber font-bold">{asOf}</span>. Fundamentals, analyst
        targets, news and options are not available point-in-time — treat anything derived from
        them as contaminated by hindsight.
      </span>
    </div>
  );
}
