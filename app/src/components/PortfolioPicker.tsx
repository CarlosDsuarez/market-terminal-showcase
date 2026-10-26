import { type ReactNode, useState } from "react";
import { todayIso } from "@/lib/asOf";
import { useSim } from "@/store/simStore";
import { usePortfolios } from "@/store/portfolioStore";
import { fmtVolume } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Portfolio selection and creation. Mounted by PORT's empty state and by PSIM,
 * so the two stay in step instead of growing separate forms.
 */
export function PortfolioPicker() {
  const { portfolios, activeId, createPortfolio, setActive, deletePortfolio } = usePortfolios();
  const asOf = useSim((s) => s.asOf);

  // A new portfolio defaults to opening on the simulation date, which is almost
  // always what someone wants after rewinding the clock.
  const [name, setName] = useState("Simulated Book");
  const [inception, setInception] = useState(asOf ?? todayIso());
  const [cash, setCash] = useState("100000");
  const [benchmark, setBenchmark] = useState("SPY");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {portfolios.length > 0 && (
        <div>
          <div className="sub-header mb-1">PORTFOLIOS</div>
          <div className="flex flex-col border border-term-border">
            {portfolios.map((p) => (
              <div key={p.id}
                className={cn("flex items-baseline gap-3 px-3 py-1.5 border-b border-term-borderSoft last:border-0",
                  p.id === activeId && "bg-term-accentSubtle")}>
                <button onClick={() => setActive(p.id)} className="flex items-baseline gap-3 flex-1 text-left">
                  <span className={cn("num w-3", p.id === activeId ? "text-term-amber" : "text-term-muted")}>
                    {p.id === activeId ? "●" : "○"}
                  </span>
                  <span className="text-term-heading flex-1 truncate">{p.name}</span>
                  <span className="sub-header">from {p.inceptionDate}</span>
                  <span className="num text-term-text w-20 text-right">{fmtVolume(p.initialCash)}</span>
                  <span className="sub-header w-16 text-right">{p.trades.length} trades</span>
                </button>
                {confirmDelete === p.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => { deletePortfolio(p.id); setConfirmDelete(null); }}
                      className="px-1 border border-term-red text-term-red text-[10px] tracking-wider">
                      CONFIRM
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-1 border border-term-border text-term-muted text-[10px] tracking-wider">
                      CANCEL
                    </button>
                  </span>
                ) : (
                  // Deleting a book destroys its whole trade history, so it asks first.
                  <button onClick={() => setConfirmDelete(p.id)}
                    className="px-1 text-term-muted hover:text-term-red text-[10px] tracking-wider">
                    DELETE
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="sub-header mb-1">NEW PORTFOLIO</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr auto" }}>
          <Field label="NAME">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          </Field>
          <Field label="INCEPTION">
            <input type="date" value={inception} max={todayIso()}
              onChange={(e) => setInception(e.target.value)} className={cn(INPUT, "num")} />
          </Field>
          <Field label="STARTING CASH">
            <input type="number" min="0" step="1000" value={cash}
              onChange={(e) => setCash(e.target.value)} className={cn(INPUT, "num")} />
          </Field>
          <Field label="BENCHMARK">
            <input value={benchmark} onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
              className={cn(INPUT, "num uppercase")} />
          </Field>
          <div className="flex items-end">
            <button
              onClick={() => createPortfolio({
                name, inceptionDate: inception, initialCash: Number(cash) || 0, benchmark,
              })}
              className="px-3 py-1 border border-term-accent text-term-accent hover:bg-term-accentSubtle tracking-[0.18em] text-[11px]">
              CREATE
            </button>
          </div>
        </div>
        <div className="sub-header mt-1 normal-case tracking-normal">
          Trades are entered at the closing price of whatever date the terminal clock is on.
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full bg-term-bg2 border border-term-border px-2 py-1 text-term-text focus:outline-none focus:border-term-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="sub-header">{label}</span>
      {children}
    </label>
  );
}
