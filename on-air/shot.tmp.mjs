import { chromium } from "@playwright/test";
const [,, url, out, w = "1586", h = "992"] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.waitForTimeout(2600);
if (process.env.SKIP) { await p.getByRole("button", { name: "Überspringen" }).first().click(); await p.waitForTimeout(2600); }
await p.screenshot({ path: out });
await b.close();
