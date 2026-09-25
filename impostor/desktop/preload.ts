import { contextBridge, ipcRenderer } from 'electron';

const config = ipcRenderer.sendSync('impostor:config') as { defaultServer: string };

contextBridge.exposeInMainWorld('impostorDesktop', {
  isDesktop: true,
  defaultServer: config.defaultServer,
  toggleFullscreen: () => ipcRenderer.invoke('impostor:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('impostor:is-fullscreen'),
});
