const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("viceIntelDesktop", {
  platform: process.platform,
  info: () => ipcRenderer.invoke("desktop:info"),
  setApiKey: (key) => ipcRenderer.invoke("desktop:set-api-key", key),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
});

// Lets the UI adapt to the native window (drag region, window-control spacing).
window.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("desktop-app"));
