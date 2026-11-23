import { contextBridge, ipcRenderer } from 'electron';

// Minimale, typisierte Brücke. Renderer haben keinen Node-Zugriff.
contextBridge.exposeInMainWorld('lolba', {
  onVM: (cb: (vm: unknown) => void) => ipcRenderer.on('vm', (_e, vm) => cb(vm)),
  onControl: (cb: (c: unknown) => void) => ipcRenderer.on('control', (_e, c) => cb(c)),
  onLayout: (cb: (l: unknown) => void) => ipcRenderer.on('overlay:layout', (_e, l) => cb(l)),
  send: (action: unknown) => ipcRenderer.send('action', action),
});
