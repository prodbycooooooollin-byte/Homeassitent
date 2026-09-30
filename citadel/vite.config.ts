import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Gleiche Oberfläche für Desktop (Tauri) und Browser.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  envPrefix: ['VITE_', 'TAURI_'],
});
