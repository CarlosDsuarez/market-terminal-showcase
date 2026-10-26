// Which data source the terminal talks to.
//
// "synthetic" (the showcase default, set in .env.development / .env.production)
// answers every request from a seeded in-browser generator — no network, no
// OpenBB process, no third-party data. "live" proxies to a local OpenBB
// Platform API exactly as the original project did (see README → Live mode).

export type DataMode = "synthetic" | "live";

export const DATA_MODE: DataMode =
  import.meta.env.VITE_DATA_MODE === "synthetic" ? "synthetic" : "live";

export const IS_SYNTHETIC = DATA_MODE === "synthetic";
