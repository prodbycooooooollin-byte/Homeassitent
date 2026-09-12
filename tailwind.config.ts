import type { Config } from "tailwindcss";

// Craftboard-Designsystem: dunkler Hintergrund, dezente Grüntöne, gut
// lesbare System-Schrift. Es gibt bewusst nur EIN (dunkles) Theme - siehe
// Aufgabenstellung - daher feste Farbwerte statt CSS-Variablen-Umschaltung.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        base: {
          DEFAULT: "#0a0e0c",
          raised: "#0d1310",
        },
        surface: {
          DEFAULT: "#121917",
          raised: "#182019",
          hover: "#1d2721",
        },
        line: {
          DEFAULT: "#233028",
          soft: "#1a241e",
        },
        ink: {
          DEFAULT: "#e8f0ea",
          muted: "#9db3a5",
          faint: "#6b8177",
        },
        accent: {
          DEFAULT: "#4ade80",
          strong: "#22c55e",
          soft: "#16351f",
          faint: "#0f2417",
        },
        gold: {
          DEFAULT: "#eab308",
          soft: "#3a2f0d",
        },
        danger: {
          DEFAULT: "#f87171",
          soft: "#3a1616",
        },
        info: {
          DEFAULT: "#60a5fa",
          soft: "#132436",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(74,222,128,0.25), 0 0 24px -4px rgba(74,222,128,0.35)",
      },
      borderRadius: {
        panel: "14px",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.15s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
