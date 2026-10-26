import { ApiError } from "@/lib/api";

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  refetch?: () => void;
  loadingLabel?: string;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function needsKeyOf(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.needsKey;
  return undefined;
}

export function QueryState({
  isLoading,
  error,
  refetch,
  loadingLabel = "Loading…",
  empty = false,
  emptyLabel = "No data.",
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-term-muted uppercase text-[11px] tracking-widest" role="status" aria-live="polite">
        {loadingLabel}
      </div>
    );
  }
  if (error) {
    const key = needsKeyOf(error);
    return (
      <div className="p-4 flex flex-col gap-2 text-[12px]" role="alert">
        <div className="text-term-red leading-relaxed">{errorMessage(error)}</div>
        {key && (
          <div className="border-l-2 border-term-amber bg-term-accentSubtle px-3 py-1.5 text-term-heading text-[11px] leading-relaxed">
            Needs credential <span className="num font-bold">{key}</span> — add it to{" "}
            <span className="num">~/.openbb_platform/user_settings.json</span> then restart the API
            (<span className="num">./stop.sh &amp;&amp; ./start.sh</span>).
          </div>
        )}
        {refetch && (
          <button
            type="button"
            onClick={refetch}
            className="self-start px-3 py-1 border border-term-accent text-term-accent hover:bg-term-accentSubtle text-[11px] tracking-[0.18em]"
          >
            RETRY
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return <div className="p-4 text-term-muted text-[12px]">{emptyLabel}</div>;
  }
  return <>{children}</>;
}
