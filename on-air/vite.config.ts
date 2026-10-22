import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri erwartet einen festen Port und keine Bildschirm-Löschung im Dev-Modus.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Eigene (leere) PostCSS-Konfiguration: verhindert, dass Vite die Tailwind-
  // Konfiguration des benachbarten Projekts im Repository-Stamm lädt.
  css: { postcss: { plugins: [] } },
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
