import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#12151c",
        panel2: "#181c26",
        line: "#242a38",
        muted: "#8a93a6",
        amber: "#f0b44c",
        sapphire: "#4aa3ff",
        win: "#3ecf8e",
        loss: "#f0616d",
      },
    },
  },
  plugins: [],
};
export default config;
