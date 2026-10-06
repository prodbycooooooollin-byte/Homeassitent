const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('farmfinder', {
  isDesktop: true,
  download: (url) => ipcRenderer.invoke('download', url),
});
