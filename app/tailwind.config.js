/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        term: {
          bg: "#0a0a0a",
          bg2: "#111111",
          panel: "#141414",
          panel2: "#1a1a1a",
          border: "#2a2a2a",
          borderSoft: "#1f1f1f",
          amber: "#f5f5f5",
          amberDim: "#8a8a8a",
          amberBright: "#ffffff",
          amberSubtle: "rgba(255,255,255,0.08)",

          // Interactive chrome only — never data. Red/green stay reserved for
          // signed price moves.
          accent: "#ff8c00",
          accentDim: "#a55f00",
          accentBright: "#ffaa33",
          accentSubtle: "rgba(255,140,0,0.12)",
          green: "#22ee22",
          greenDim: "#128812",
          red: "#ff3b3b",
          redDim: "#9a1414",
          muted: "#6e6e6e",
          text: "#d0d0d0",
          heading: "#f0f0f0",
        },
      },
      boxShadow: {
        panel: "none",
      },
    },
  },
  plugins: [],
};
