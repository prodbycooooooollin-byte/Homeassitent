import { defineConfig } from "@playwright/test";

// UI-Layouttests gegen die Browser-Vorschau (Beispiel-Backend, keine echten Dienste).
export default defineConfig({
  testDir: "tests-ui",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
