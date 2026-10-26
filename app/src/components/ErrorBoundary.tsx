import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this clears a previous crash, so switching tabs recovers. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, one throwing function panel unmounts the whole terminal and
 * leaves a blank page — including the command bar needed to navigate away.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Function panel crashed:", error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  private resetWorkspace = () => {
    try {
      localStorage.removeItem("market-terminal-workspace");
      localStorage.removeItem("bbterminal-workspace");
    } finally {
      location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-4 flex flex-col gap-3 text-[12px]">
        <div className="text-term-red text-[11px] tracking-[0.25em] font-bold">
          FUNCTION FAILED
        </div>
        <div className="text-term-text">
          This panel hit an error. The rest of the terminal is still usable — run another
          function from the command bar, or retry.
        </div>
        <pre className="text-term-muted text-[11px] whitespace-pre-wrap border border-term-border bg-term-panel2 p-2 overflow-auto max-h-40">
          {error.message || String(error)}
        </pre>
        <div className="flex items-center gap-2">
          <button
            onClick={this.retry}
            className="text-term-amber text-[11px] font-bold px-2 py-0.5 border border-term-accentDim hover:bg-term-accentSubtle"
          >
            &lt;RETRY&gt;
          </button>
          <button
            onClick={this.resetWorkspace}
            className="text-term-muted text-[11px] px-2 py-0.5 border border-term-border hover:bg-term-accentSubtle"
          >
            &lt;RESET WORKSPACE&gt;
          </button>
        </div>
        <div className="sub-header">
          RESET WORKSPACE CLEARS SAVED TABS AND RELOADS — USE IF THE CRASH RETURNS ON EVERY LOAD
        </div>
      </div>
    );
  }
}
