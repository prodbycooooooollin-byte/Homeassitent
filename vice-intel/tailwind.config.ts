import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          faint: "rgb(var(--fg-faint) / <alpha-value>)",
        },
        violet: {
          300: "rgb(var(--violet-300) / <alpha-value>)",
          400: "rgb(var(--violet-400) / <alpha-value>)",
          500: "rgb(var(--violet-500) / <alpha-value>)",
          600: "rgb(var(--violet-600) / <alpha-value>)",
          900: "rgb(var(--violet-900) / <alpha-value>)",
        },
        sunset: {
          400: "rgb(var(--sunset-400) / <alpha-value>)",
          500: "rgb(var(--sunset-500) / <alpha-value>)",
        },
        rose: { 400: "rgb(var(--rose-400) / <alpha-value>)" },
        status: {
          verified: "rgb(var(--status-verified) / <alpha-value>)",
          official: "rgb(var(--status-official) / <alpha-value>)",
          estimate: "rgb(var(--status-estimate) / <alpha-value>)",
          theory: "rgb(var(--status-theory) / <alpha-value>)",
          unverified: "rgb(var(--status-unverified) / <alpha-value>)",
          demo: "rgb(var(--status-demo) / <alpha-value>)",
          unknown: "rgb(var(--status-unknown) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["'Inter Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Sora Variable'", "'Inter Variable'", "ui-sans-serif", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px", "3xl": "26px" },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 12px 40px -12px rgb(0 0 0 / 0.6)",
        glow: "0 0 0 1px rgb(var(--violet-500) / 0.45), 0 0 32px -6px rgb(var(--violet-500) / 0.55)",
        "glow-sm": "0 0 0 1px rgb(var(--violet-500) / 0.35), 0 0 18px -6px rgb(var(--violet-500) / 0.5)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        scanline: { "0%": { top: "0%" }, "100%": { top: "100%" } },
        pulseRing: { "0%": { transform: "scale(.8)", opacity: ".8" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.2,.7,.2,1) both",
        shimmer: "shimmer 1.6s linear infinite",
        scanline: "scanline 1.8s cubic-bezier(.45,0,.55,1) infinite alternate",
        "pulse-ring": "pulseRing 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
