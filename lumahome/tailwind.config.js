/** @type {import('tailwindcss').Config} */
// Farbwerte stammen aus dem LumaHome-Designvorschlag (siehe docs/DESIGN.md).
// Kontraste werden in tests/contrast.test.ts geprüft.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F3EE",
        surface: { DEFAULT: "#FFFFFF", 2: "#ECEEE8", 3: "#E3E5DE" },
        line: { DEFAULT: "#DCDED6", strong: "#C4C8BF" },
        ink: { DEFAULT: "#242A28", 2: "#6F7773", 3: "#8C938F" },
        sage: { DEFAULT: "#4D7163", dark: "#3C5A4E", soft: "#E0EBE4", mid: "#A9C2B6" },
        energy: { DEFAULT: "#7866B2", soft: "#ECE8F6", dark: "#5E4E97" },
        warn: { DEFAULT: "#8A5A00", soft: "#FBF0D9", line: "#E9C987" },
        danger: { DEFAULT: "#A63A2F", soft: "#F8E3DF", line: "#E3A79F" },
        lamp: { DEFAULT: "#E8B04A", soft: "#FCF1D9" },
      },
      fontFamily: {
        sans: ['"Inter var"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(36,42,40,0.06), 0 8px 24px -10px rgba(36,42,40,0.18)",
        float: "0 2px 6px rgba(36,42,40,0.08), 0 18px 40px -16px rgba(36,42,40,0.28)",
      },
      borderRadius: { "2xl": "1.1rem", "3xl": "1.5rem" },
    },
  },
  plugins: [],
};
