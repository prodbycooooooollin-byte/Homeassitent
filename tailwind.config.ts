// Alle Farbtokens werden über CSS-Variablen (RGB-Tripel) aufgelöst, damit
// Hell-/Dunkelmodus (siehe app/globals.css und ThemeEffect) zur Laufzeit
// umgeschaltet werden kann. `<alpha-value>` ist Tailwinds eingebauter
// Platzhalter für Opacity-Modifier (z. B. bg-accent/20) - die "weichen"
// Töne (line, *-soft) sind dabei bereits als fertig abgetönte RGB-Werte in
// den CSS-Variablen hinterlegt (siehe app/globals.css), damit sie ohne
// Modifier standardmäßig dezent statt kräftig erscheinen.
function withAlpha(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config = {
  darkMode: ["class"],
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
          DEFAULT: withAlpha("--color-base"),
        },
        surface: {
          DEFAULT: withAlpha("--color-surface"),
          raised: withAlpha("--color-surface-raised"),
          hover: withAlpha("--color-surface-hover"),
          navy: withAlpha("--color-surface-navy"),
        },
        line: {
          DEFAULT: withAlpha("--color-line"),
          soft: withAlpha("--color-line-soft"),
          strong: withAlpha("--color-line-strong"),
        },
        ink: {
          DEFAULT: withAlpha("--color-ink"),
          muted: withAlpha("--color-ink-muted"),
          faint: withAlpha("--color-ink-faint"),
        },
        accent: {
          DEFAULT: withAlpha("--color-accent"),
          soft: withAlpha("--color-accent-soft"),
          strong: withAlpha("--color-accent-strong"),
          dim: withAlpha("--color-accent-dim"),
        },
        good: {
          DEFAULT: withAlpha("--color-good"),
          soft: withAlpha("--color-good-soft"),
        },
        warn: {
          DEFAULT: withAlpha("--color-warn"),
          soft: withAlpha("--color-warn-soft"),
        },
        solar: {
          DEFAULT: withAlpha("--color-warn"),
          soft: withAlpha("--color-warn-soft"),
        },
        bad: {
          DEFAULT: withAlpha("--color-bad"),
          soft: withAlpha("--color-bad-soft"),
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glowAccent: "0 0 0 1px rgba(61,139,253,0.25), 0 0 24px -4px rgba(61,139,253,0.45)",
        glowGood: "0 0 0 1px rgba(47,214,129,0.25), 0 0 24px -4px rgba(47,214,129,0.4)",
        glowWarn: "0 0 0 1px rgba(245,165,36,0.25), 0 0 24px -4px rgba(245,165,36,0.4)",
        glowBad: "0 0 0 1px rgba(242,73,92,0.25), 0 0 24px -4px rgba(242,73,92,0.4)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "flow-dash": {
          "0%": { strokeDashoffset: "40" },
          "100%": { strokeDashoffset: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "flow-dash": "flow-dash 1.2s linear infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
