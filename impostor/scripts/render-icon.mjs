// Rendert das App-Icon (desktop/resources/icon.png, 512×512) aus eigenem SVG.
import { chromium } from 'playwright-core';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#23305a"/><stop offset="1" stop-color="#0d1222"/></radialGradient>
    <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 14h28M14 0v28" stroke="#26345e" stroke-width="2"/><circle cx="14" cy="14" r="2.4" fill="#2f8f8a"/>
    </pattern>
  </defs>
  <g transform="rotate(-8 256 256)">
    <rect x="96" y="40" width="320" height="432" rx="44" fill="#f7f0e2" stroke="#0d1222" stroke-width="10"/>
  </g>
  <rect x="96" y="40" width="320" height="432" rx="44" fill="url(#g)" stroke="#e8dcc4" stroke-width="10"/>
  <rect x="96" y="40" width="320" height="432" rx="44" fill="url(#p)" opacity="0.8"/>
  <rect x="122" y="66" width="268" height="380" rx="28" fill="none" stroke="#3fd8c8" stroke-opacity="0.6" stroke-width="5"/>
  <g transform="translate(256 262)">
    <path d="M-120 -20c0-56 50-86 120-86s120 30 120 86c0 50-42 96-120 96s-120-46-120-96z" fill="#f5eee0" stroke="#0d1222" stroke-width="10"/>
    <path d="M-80 -22q24-28 48 0q-24 20-48 0zM32 -22q24-28 48 0q-24 20-48 0z" fill="#0d1222"/>
    <path d="M-24 34q24 16 48 0" stroke="#ff6f61" stroke-width="12" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: 'desktop/resources/icon.png', omitBackground: true });
await browser.close();
console.log('desktop/resources/icon.png geschrieben');
