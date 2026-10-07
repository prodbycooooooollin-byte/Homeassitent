// Brücke zwischen Desktop-Hülle und Web-Oberfläche (contextIsolation bleibt aktiv).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("updater:info"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  onUpdateState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("updater:state", handler);
    return () => ipcRenderer.removeListener("updater:state", handler);
  },
});
