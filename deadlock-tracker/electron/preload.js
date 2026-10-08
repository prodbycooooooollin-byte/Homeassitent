// Brücke zwischen Desktop-Hülle und Web-Oberfläche (contextIsolation bleibt aktiv).
const { contextBridge, ipcRenderer } = require("electron");

// Markiert die Oberfläche als Desktop-App (Titelleiste, Ziehbereich, Platz für die Fenster-Buttons)
window.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("desktop"));

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  // Updater
  getInfo: () => ipcRenderer.invoke("updater:info"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  onUpdateState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("updater:state", handler);
    return () => ipcRenderer.removeListener("updater:state", handler);
  },
  // Desktop-Einstellungen (Tray, Autostart, Benachrichtigungen)
  getDesktopSettings: () => ipcRenderer.invoke("desktop:get"),
  setDesktopSettings: (patch) => ipcRenderer.invoke("desktop:set", patch),
  getIngest: () => ipcRenderer.invoke("ingest:status"),
  onIngestState: (cb) => {
    const handler = (_e, s) => cb(s);
    ipcRenderer.on("ingest:state", handler);
    return () => ipcRenderer.removeListener("ingest:state", handler);
  },
  notify: (n) => ipcRenderer.invoke("desktop:notify", n),
  onNavigate: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on("desktop:navigate", handler);
    return () => ipcRenderer.removeListener("desktop:navigate", handler);
  },
});
