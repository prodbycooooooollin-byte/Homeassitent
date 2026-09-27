import { contextBridge, ipcRenderer } from 'electron';

// Minimale Brücke. Renderer haben keinen Node-Zugriff.
contextBridge.exposeInMainWorld('dia', {
  onVM: (cb: (m: unknown) => void) => ipcRenderer.on('vm', (_e, m) => cb(m)),
  onControl: (cb: (m: unknown) => void) => ipcRenderer.on('control', (_e, m) => cb(m)),
  onSelectTab: (cb: (t: string) => void) => ipcRenderer.on('select-tab', (_e, t) => cb(t)),
  send: (action: unknown) => ipcRenderer.send('action', action),
});
