import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Der Web-Client wird relativ gebaut (base './'), damit derselbe Build
// im Browser (vom Spielserver ausgeliefert) und in der Desktop-App (file://) läuft.
export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  // Eigene (leere) PostCSS-Konfiguration: verhindert, dass Vite die Tailwind-Konfiguration
  // des übergeordneten Repos (../postcss.config.js) lädt.
  css: { postcss: {} },
  define: {
    __DEFAULT_SERVER__: JSON.stringify(process.env.IMPOSTOR_SERVER_URL ?? ''),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/healthz': 'http://localhost:8787',
    },
  },
});
