import { type ReactNode } from "react";
import { FN_BY_CODE, type FunctionCode } from "@/lib/functions";
import { LookaheadBanner } from "@/components/LookaheadBanner";

interface Props {
  code: FunctionCode;
  symbol?: string;
  children: ReactNode;
}

export function FunctionPanel({ code, symbol, children }: Props) {
  // A code that no longer exists must not take the header down with it.
  const fn = FN_BY_CODE[code] ?? { name: "Unknown function", summary: "", pointInTime: true };
  return (
    <div className="panel flex-1 min-h-0 min-w-0">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <span className="text-term-accent font-bold">{code}</span>
          <span className="text-term-muted">·</span>
          <span className="text-term-heading">{fn.name}</span>
          {symbol && (
            <>
              <span className="text-term-muted">·</span>
              <span className="text-term-heading num">{symbol}</span>
            </>
          )}
        </div>
        <div className="text-term-muted normal-case tracking-normal font-normal text-[10px]">
          {fn.summary}
        </div>
      </div>
      {/* Every screen is wrapped here, so one mount covers the whole terminal. */}
      {!fn.pointInTime && <LookaheadBanner />}
      <div className="flex-1 min-h-0 overflow-auto scroll-thin">{children}</div>
    </div>
  );
}
