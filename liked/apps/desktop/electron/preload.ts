import { contextBridge, ipcRenderer } from 'electron';
import type { LikedApi } from '../src/shared/ipc-types.js';

/**
 * Eng begrenzte Brücke: nur benannte Aufrufe, keine generischen ipcRenderer-Zugriffe.
 * Der Hauptprozess validiert jede Eingabe zusätzlich.
 */
const invoke = (channel: string, arg?: unknown) => ipcRenderer.invoke(channel, arg);
const subscribe = (channel: string) => (cb: (v: any) => void) => {
  const listener = (_e: unknown, v: unknown) => cb(v);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: LikedApi = {
  app: {
    info: () => invoke('app:info'),
    smokeTestDone: (ok) => ipcRenderer.send('app:smoke-done', ok === true),
    quit: () => ipcRenderer.send('app:quit')
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    wipeLocalData: () => invoke('settings:wipe')
  },
  window: { setFullscreen: (on) => invoke('window:fullscreen', on) },
  shell: { openExternal: (url) => invoke('shell:open', url) },
  tiktok: {
    overview: () => invoke('tiktok:overview'),
    connect: (a) => invoke('tiktok:connect', a),
    sync: () => invoke('tiktok:sync'),
    cancel: () => invoke('tiktok:cancel'),
    commitCollected: () => invoke('tiktok:commit'),
    disconnect: () => invoke('tiktok:disconnect'),
    sample: (n) => invoke('tiktok:sample', n),
    listClips: () => invoke('tiktok:list'),
    setExcluded: (id, excluded) => invoke('tiktok:exclude', { id, excluded }),
    buildPool: (mode, salt) => invoke('tiktok:pool', { mode, salt }),
    recordPlayed: (ids) => invoke('tiktok:played', ids),
    onStatus: subscribe('tiktok:status') as LikedApi['tiktok']['onStatus']
  },
  updates: {
    check: () => invoke('updates:check'),
    download: () => invoke('updates:download'),
    installOnQuit: () => invoke('updates:installOnQuit'),
    onStatus: subscribe('updates:status') as LikedApi['updates']['onStatus']
  },
  localServer: {
    start: (port) => invoke('local:start', port),
    stop: () => invoke('local:stop'),
    status: () => invoke('local:status')
  },
  lastRoom: {
    get: () => invoke('lastRoom:get'),
    set: (v) => invoke('lastRoom:set', v)
  },
  onDeepLink: subscribe('deep-link') as LikedApi['onDeepLink']
};

contextBridge.exposeInMainWorld('liked', api);
