import { contextBridge, ipcRenderer } from 'electron';

// Brücke für das unsichtbare Aufnahmefenster (keine Node-Rechte im Renderer).
contextBridge.exposeInMainWorld('cap', {
  onStart: (cb: (o: { sourceId: string; width: number; height: number; fps: number }) => void) => ipcRenderer.on('cap-start', (_e, o) => cb(o)),
  onStop: (cb: () => void) => ipcRenderer.on('cap-stop', () => cb()),
  onGrab: (cb: (o: { id: number }) => void) => ipcRenderer.on('cap-grab', (_e, o) => cb(o)),
  reply: (o: unknown) => ipcRenderer.send('cap-result', o),
});
