import { todayIso } from "@/lib/asOf";
import { useSim, type StepUnit } from "@/store/simStore";
import { useWorkspace } from "@/store/workspaceStore";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { cn } from "@/lib/cn";

const STEPS: { label: string; unit: StepUnit; n: number }[] = [
  { label: "−1Y", unit: "Y", n: -1 },
  { label: "−1M", unit: "M", n: -1 },
  { label: "−1W", unit: "W", n: -1 },
  { label: "−1D", unit: "D", n: -1 },
  { label: "+1D", unit: "D", n: 1 },
  { label: "+1W", unit: "W", n: 1 },
  { label: "+1M", unit: "M", n: 1 },
  { label: "+1Y", unit: "Y", n: 1 },
];

/** Dates worth dropping into. Each one is a regime the tape actually remembers. */
const BOOKMARKS = [
  { date: "2007-10-09", label: "Pre-GFC peak" },
  { date: "2008-09-15", label: "Lehman files" },
  { date: "2009-03-09", label: "GFC bottom" },
  { date: "2015-08-24", label: "China devaluation" },
  { date: "2018-12-24", label: "Q4-18 selloff" },
  { date: "2020-03-23", label: "COVID bottom" },
  { date: "2022-01-03", label: "2022 peak" },
  { date: "2022-10-12", label: "2022 bottom" },
];

const SPEEDS = [
  { label: "SLOW", ms: 1200 },
  { label: "1×", ms: 600 },
  { label: "FAST", ms: 200 },
];

export function PSIM() {
  const { asOf, replaySpeed, setAsOf, advance, startReplay, stopReplay } = useSim();
  const openTab = useWorkspace((s) => s.openTab);
  const activeSymbol = useWorkspace((s) => s.activeSymbol);
  const live = asOf == null;

  return (
    <div className="p-4 grid gap-4 text-[12px]" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>

      <div className="col-span-2 flex items-start justify-between border-b border-term-border pb-3">
        <div>
          <div className="sub-header">TERMINAL CLOCK</div>
          <div className={cn("text-[34px] font-bold tracking-widest num mt-1",
            live ? "text-term-muted" : "text-term-heading")}>
            {live ? "LIVE" : asOf}
          </div>
          <div className="text-term-muted text-[11px] mt-1">
            {live
              ? "Every function is showing current data."
              : "Price, index, FX, crypto and curve functions are rewound to this date."}
          </div>
        </div>
        <button
          onClick={() => setAsOf(null)}
          disabled={live}
          className={cn("px-3 py-1 border tracking-[0.18em] text-[11px]",
            live
              ? "border-term-borderSoft text-term-muted cursor-default"
              : "border-term-accent text-term-accent hover:bg-term-accentSubtle")}
        >
          RETURN TO LIVE
        </button>
      </div>

      <div className="panel">
        <div className="panel-header"><span>SET DATE</span></div>
        <div className="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={asOf ?? todayIso()}
              max={todayIso()}
              onChange={(e) => e.target.value && setAsOf(e.target.value)}
              className="bg-term-bg2 border border-term-border px-2 py-1 num text-term-amberBright focus:outline-none focus:border-term-accent"
            />
            <span className="sub-header">max {todayIso()}</span>
          </div>

          <div>
            <div className="sub-header mb-1">STEP</div>
            <div className="flex flex-wrap gap-1">
              {STEPS.map((s) => (
                <button key={s.label} onClick={() => advance(s.unit, s.n)}
                  className="px-2 py-0.5 border border-term-border num text-term-text hover:border-term-accent hover:text-term-accent">
                  {s.label}
                </button>
              ))}
            </div>
            {live && (
              <div className="sub-header mt-1 normal-case tracking-normal">
                Stepping from LIVE starts the clock at today.
              </div>
            )}
          </div>

          <div>
            <div className="sub-header mb-1">REPLAY — steps one calendar day at a time</div>
            <div className="flex flex-wrap items-center gap-1">
              {SPEEDS.map((s) => (
                <button key={s.label} onClick={() => startReplay(s.ms)}
                  disabled={live}
                  className={cn("px-2 py-0.5 border tracking-wider",
                    replaySpeed === s.ms
                      ? "border-term-accent text-term-accent"
                      : live
                        ? "border-term-borderSoft text-term-muted cursor-default"
                        : "border-term-border text-term-text hover:border-term-accent hover:text-term-accent")}>
                  ▶ {s.label}
                </button>
              ))}
              <button onClick={stopReplay} disabled={replaySpeed == null}
                className={cn("px-2 py-0.5 border tracking-wider",
                  replaySpeed == null
                    ? "border-term-borderSoft text-term-muted cursor-default"
                    : "border-term-accent text-term-accent hover:bg-term-accent hover:text-term-bg")}>
                ■ STOP
              </button>
            </div>
            {live && (
              <div className="sub-header mt-1 normal-case tracking-normal">
                Set a past date before replaying.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span>JUMP TO</span></div>
        <div className="flex flex-col divide-y divide-term-borderSoft">
          {BOOKMARKS.map((b) => (
            <button key={b.date} onClick={() => setAsOf(b.date)}
              className={cn("flex items-baseline gap-3 px-3 py-1.5 text-left hover:bg-term-accentSubtle",
                asOf === b.date && "bg-term-accentSubtle")}>
              <span className="num text-term-amber w-24">{b.date}</span>
              <span className="text-term-heading flex-1">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel col-span-2">
        <div className="panel-header"><span>PORTFOLIOS</span></div>
        <div className="p-3"><PortfolioPicker /></div>
      </div>

      <div className="panel col-span-2">
        <div className="panel-header"><span>WHAT REWINDS, AND WHAT DOES NOT</span></div>
        <div className="p-3 grid grid-cols-2 gap-4 text-[11px]">
          <div>
            <div className="sub-header mb-1"><span className="text-term-heading">● POINT-IN-TIME</span></div>
            <div className="text-term-text leading-relaxed">
              <span className="num text-term-amber">GP · TECH · HP · WEI · FXC · CRYPTO · CURV</span>
              <br />
              These read daily bars and treasury rates, which the provider serves for any historical
              window. What you see is what was on the screen that day.
            </div>
          </div>
          <div>
            {/* Red here is deliberate and matches the LOOKAHEAD banner: this is
                the list of screens that will quietly lie to you in a simulation. */}
            <div className="sub-header mb-1"><span className="text-term-red">● NOT POINT-IN-TIME</span></div>
            <div className="text-term-text leading-relaxed">
              <span className="num text-term-red">INTEL · KEY · FA · EE · NI · OMON · QR · MOV · DES · CC</span>
              <br />
              The free data layer has no historical fundamentals, analyst targets, news or options
              chains. These screens keep showing <strong>today&apos;s</strong> numbers and carry a red
              LOOKAHEAD banner while the clock is rewound. Anything you conclude from them in a
              simulation is contaminated by hindsight.
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-term-border pt-2 text-[11px]">
        <span className="sub-header">GO TO:</span>
        {[
          { c: "PORT", label: "Portfolio", sym: false }, { c: "TRADE", label: "Blotter", sym: false },
          { c: "ALGO", label: "Algos", sym: false },
          { c: "PERF", label: "Performance", sym: false },
          { c: "GP", label: "Chart", sym: true }, { c: "TECH", label: "Technicals", sym: true },
          { c: "CC", label: "Command Center", sym: false }, { c: "CURV", label: "Yield Curve", sym: false },
        ].map((x) => (
          // GP and TECH need a symbol; opening them without one renders an
          // undefined ticker and fires a request for "undefined".
          <button key={x.c} onClick={() => openTab(x.c as never, x.sym ? activeSymbol : undefined)}
            className="px-2 py-0.5 border border-term-border hover:border-term-accent hover:text-term-accent text-term-muted tracking-wider">
            {x.c} <span className="text-term-muted normal-case">· {x.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
