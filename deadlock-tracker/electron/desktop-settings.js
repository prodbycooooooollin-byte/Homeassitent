// Desktop-spezifische Einstellungen (Tray, Autostart …) – getrennt von den App-Einstellungen, da sie das Betriebssystem betreffen.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULTS = { closeToTray: false, autoStart: false, startMinimized: false, desktopNotifications: true };
const file = () => path.join(app.getPath("userData"), "desktop-settings.json");

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; } catch { return { ...DEFAULTS }; }
}
function save(s) {
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(s)); } catch { /* nicht kritisch */ }
}
function sanitize(p) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (typeof p[k] === "boolean") out[k] = p[k];
  return out;
}
module.exports = { load, save, sanitize, DEFAULTS };
