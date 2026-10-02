import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Im Entwicklungsmodus läuft die Oberfläche auf Vite (Port 5173) und leitet
// /api an den lokalen LumaHome-Server (Port 8787) weiter. Im Betrieb liefert
// der Server die gebaute Oberfläche aus dist/ selbst aus.
export default defineConfig({
  // Relative Pfade: dieselbe Oberfläche funktioniert unter / (lokaler Server)
  // und unter einem Unterpfad (z. B. GitHub Pages /Homeassitent/).
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } },
  },
  // Die gebaute Seite braucht keinen Server: keine /api-Weiterleitung in der Vorschau
  preview: { proxy: {} },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
});
