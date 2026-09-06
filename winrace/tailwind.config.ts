import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        base: {
          DEFAULT: "#050509",
          raised: "#0b0b13",
          card: "#111120",
          "card-hover": "#161628",
          border: "#22222f",
          "border-strong": "#33334a",
        },
        ink: {
          DEFAULT: "#f2f2f7",
          muted: "#a3a3b8",
          faint: "#6b6b82",
        },
        brand: {
          DEFAULT: "#8b5cf6",
          cyan: "#22d3ee",
          pink: "#ec4899",
        },
        success: "#22c55e",
        warning: "#f5a524",
        danger: "#ef4444",
        info: "#38bdf8",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(255 255 255 / 0.04), 0 8px 30px -8px rgb(0 0 0 / 0.6)",
        "glow-brand": "0 0 24px -4px rgb(139 92 246 / 0.55)",
        "inner-line": "inset 0 1px 0 0 rgb(255 255 255 / 0.05)",
      },
      backgroundImage: {
        "radial-fade": "radial-gradient(circle at top, rgb(139 92 246 / 0.16), transparent 60%)",
        "grid-fade":
          "linear-gradient(to bottom, transparent, rgb(5 5 9 / 1)), linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pop": { "0%": { transform: "scale(0.92)", opacity: "0" }, "60%": { transform: "scale(1.03)", opacity: "1" }, "100%": { transform: "scale(1)" } },
        "pulse-glow": { "0%,100%": { boxShadow: "0 0 0 0 rgb(139 92 246 / 0.35)" }, "50%": { boxShadow: "0 0 0 8px rgb(139 92 246 / 0)" } },
        "shimmer": { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "confetti-fall": { "0%": { transform: "translateY(-10%) rotate(0deg)", opacity: "1" }, "100%": { transform: "translateY(110%) rotate(360deg)", opacity: "0" } },
        "ring-fill": { from: { strokeDashoffset: "var(--ring-from)" }, to: { strokeDashoffset: "var(--ring-to)" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-up": "slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both",
        pop: "pop 0.45s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-glow": "pulse-glow 2.2s ease-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "confetti-fall": "confetti-fall 2.6s ease-in forwards",
      },
    },
  },
  plugins: [],
};

export default config;
