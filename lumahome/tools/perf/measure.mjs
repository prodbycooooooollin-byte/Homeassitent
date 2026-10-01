// Leistungsmessung mit dem Demo-Projekt. Voraussetzung: laufender Server
// (npm run build && npm start). Aufruf: node tools/perf/measure.mjs [url]
// Gibt je Profil Ladezeit, Netzanzahl, Zeichenaufrufe sowie Bildzeiten beim
// Drehen und die Renderarbeit im Stillstand aus.
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const url = process.argv[2] ?? "http://127.0.0.1:8787/";
const exe = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PROFILES = [
  { name: "Desktop 1366×860, Grafik „Ausgewogen“", viewport: { width: 1366, height: 860 }, quality: "medium", cpu: 1 },
  { name: "Desktop 1366×860, Grafik „Hoch“", viewport: { width: 1366, height: 860 }, quality: "high", cpu: 1 },
  { name: "Tablet-Profil 1280×800, CPU 4× gedrosselt, Grafik „Sparsam“", viewport: { width: 1280, height: 800 }, quality: "low", cpu: 4 },
  { name: "Tablet-Profil 1280×800, CPU 4× gedrosselt, Grafik „Ausgewogen“", viewport: { width: 1280, height: 800 }, quality: "medium", cpu: 4 },
];

const browser = await chromium.launch({
  executablePath: existsSync(exe) ? exe : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const results = [];
for (const p of PROFILES) {
  const ctx = await browser.newContext({ viewport: p.viewport });
  await ctx.addInitScript((q) => {
    localStorage.setItem("lumahome.mode.v1", "demo");
    localStorage.setItem("lumahome.ui.v1", JSON.stringify({ quality: q }));
  }, p.quality);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__lh && window.__lh.meshCount() > 50, null, { timeout: 120_000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ meshes: window.__lh.meshCount(), calls: window.__lh.renderInfo().calls, tris: window.__lh.renderInfo().triangles }));
  // Stillstand: wie viele Bilder werden ohne Interaktion gezeichnet?
  const idle = await page.evaluate(async () => {
    const before = window.__lh.renderInfo().frame;
    await new Promise((r) => setTimeout(r, 3000));
    return window.__lh.renderInfo().frame - before;
  });
  // Drehen: Maus über die Szene ziehen und Bildzeiten messen
  const box = await page.locator("canvas").first().boundingBox();
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const loop = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__frames.length < 2000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const cx = box.x + box.width * 0.6;
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const startF = await page.evaluate(() => window.__lh.renderInfo().frame);
  const t1 = Date.now();
  for (let i = 0; i < 60; i++) await page.mouse.move(cx + Math.sin(i / 10) * 250, cy + Math.cos(i / 12) * 60);
  await page.mouse.up();
  const dragMs = Date.now() - t1;
  const rendered = (await page.evaluate(() => window.__lh.renderInfo().frame)) - startF;
  const frames = (await page.evaluate(() => window.__frames)).slice(2);
  frames.sort((a, b) => a - b);
  const median = frames[Math.floor(frames.length / 2)] ?? 0;
  const p95 = frames[Math.floor(frames.length * 0.95)] ?? 0;
  results.push({ profile: p.name, loadMs, ...info, idleFrames3s: idle, dragRendered: rendered, dragMs, renderFps: +(rendered / (dragMs / 1000)).toFixed(1), rafMedianMs: +median.toFixed(1), rafP95Ms: +p95.toFixed(1) });
  await ctx.close();
}
await browser.close();
console.table(results);
console.log(JSON.stringify(results, null, 2));
