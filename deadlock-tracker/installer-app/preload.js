const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("setup", {
  info: () => ipcRenderer.invoke("setup:info"),
  chooseDir: () => ipcRenderer.invoke("setup:chooseDir"),
  install: (dir) => ipcRenderer.invoke("setup:install", dir),
  launch: (exe) => ipcRenderer.invoke("setup:launch", exe),
  minimize: () => ipcRenderer.invoke("setup:minimize"),
  close: () => ipcRenderer.invoke("setup:close"),
  onEvent: (cb) => { const h = (_e, m) => cb(m); ipcRenderer.on("setup:event", h); return () => ipcRenderer.removeListener("setup:event", h); },
});
