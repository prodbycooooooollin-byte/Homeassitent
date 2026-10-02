import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Ein frischer Datenordner je Lauf: Tests beginnen mit der Ersteinrichtung.
const dataDir = `./test-results/data-${Date.now()}`;
const chromium = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = {
  executablePath: existsSync(chromium) ? chromium : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-report.json" }]],
  use: { baseURL: "http://127.0.0.1:8791", trace: "retain-on-failure", screenshot: "only-on-failure", acceptDownloads: true },
  projects: [
    { name: "desktop", testMatch: /live\.spec\.ts|free\.spec\.ts|energy-scene\.spec\.ts/, use: { viewport: { width: 1366, height: 860 }, launchOptions } },
    { name: "touch", testMatch: /touch\.spec\.ts/, use: { ...devices["Pixel 7"], browserName: "chromium", launchOptions } },
    // Webseiten-Betrieb: nur statische Dateien, kein LumaHome-Server
    { name: "web", testMatch: /web\.spec\.ts/, use: { baseURL: "http://127.0.0.1:8792", viewport: { width: 1366, height: 860 }, launchOptions } },
  ],
  webServer: [
    { command: "node tools/fake-ha/server.mjs 18124 e2e-token-0123456789abcdefghijklmnop", url: "http://127.0.0.1:18124/control/calls", reuseExistingServer: false, timeout: 20_000 },
    {
      command: "npx vite build && npx tsx server/index.ts",
      url: "http://127.0.0.1:8791/api/health",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { PORT: "8791", HA_URL: "http://127.0.0.1:18124", HA_TOKEN: "e2e-token-0123456789abcdefghijklmnop", LUMAHOME_DATA_DIR: dataDir, LUMAHOME_TEST_HOOKS: "1" },
    },
    // Statische Auslieferung wie bei GitHub Pages (gebaut vom vorherigen Eintrag)
    { command: "npx vite preview --port 8792 --strictPort --host 127.0.0.1", url: "http://127.0.0.1:8792/", reuseExistingServer: false, timeout: 200_000 },
  ],
});
