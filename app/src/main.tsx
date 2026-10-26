import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
// Self-hosted font (SIL OFL 1.1) so the demo makes no third-party requests.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Per-screen staleTimes (30–120s) still win where set; this stops
      // queries *without* one from refetching every few seconds on remount.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // A hidden tab must not keep polling Yahoo behind your back.
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
