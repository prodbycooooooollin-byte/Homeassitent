// Rendert das App-Icon (SVG → 1024-px-PNG) mit Chromium über Playwright.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("src-tauri/icons/source.svg", "utf8");
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator("svg").screenshot({ path: "src-tauri/icons/source.png", omitBackground: true });
await browser.close();
console.log("src-tauri/icons/source.png geschrieben");
