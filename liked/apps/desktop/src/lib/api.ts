import { AVATARS } from '@liked/protocol';
import { buildIndex, demoLikes, DEMO_ACCOUNT_LABEL, selectCandidates, pushRecentPlayed } from '@liked/tiktok-connectors';
import type { AppSettings, LikedApi, TikTokOverview } from '../shared/ipc-types';

declare global {
  interface Window {
    liked?: LikedApi;
  }
}

/**
 * Browser-Vorschau (nur Entwicklung): Wird die Oberfläche ohne Electron geöffnet,
 * ersetzt diese Attrappe die IPC-Schnittstelle. Sie bietet ausschließlich Demo-Daten
 * und meldet TikTok ehrlich als „nicht verfügbar“.
 */
function browserMock(): LikedApi {
  const key = `liked-preview-${new URLSearchParams(location.search).get('profile') ?? 'default'}`;
  const read = (): AppSettings => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (v) return v;
    } catch {
      /* leer */
    }
    const s: AppSettings = {
      profile: { name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!, deviceId: crypto.randomUUID().replace(/-/g, '') },
      serverUrl: (import.meta.env.VITE_DEFAULT_SERVER_URL as string | undefined) ?? 'http://localhost:8787',
      audio: { music: 0.5, sfx: 0.7, musicMuted: false, sfxMuted: false, videoStartMuted: false },
      display: { fullscreen: false, reducedMotion: 'system', effects: 'high' },
      introSeen: false,
      experimentalWebAdapter: false
    };
    localStorage.setItem(key, JSON.stringify(s));
    return s;
  };
  let settings = read();
  let recent: string[] = [];
  const overview = (): TikTokOverview => ({
    status: { kind: 'unsupported', reason: 'adapter_unavailable', detail: 'Browser-Vorschau ohne Desktop-App' },
    index: null,
    officialConfigured: null,
    experimentalEnabled: false
  });
  const noop = () => () => undefined;
  return {
    app: {
      info: async () => ({ version: '0.1.0-preview', platform: 'browser', packaged: false, smokeTest: false }),
      smokeTestDone: () => undefined,
      quit: () => window.close()
    },
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch, profile: { ...settings.profile, ...patch.profile }, audio: { ...settings.audio, ...patch.audio }, display: { ...settings.display, ...patch.display } };
        localStorage.setItem(key, JSON.stringify(settings));
        return settings;
      },
      wipeLocalData: async () => undefined
    },
    window: { setFullscreen: async (on) => void (on ? document.documentElement.requestFullscreen() : document.exitFullscreen?.()) },
    shell: { openExternal: async (url) => !!window.open(url, '_blank', 'noopener') },
    tiktok: {
      overview: async () => overview(),
      connect: async () => overview(),
      sync: async () => overview(),
      cancel: async () => overview(),
      commitCollected: async () => overview(),
      disconnect: async () => overview(),
      sample: async () => [],
      listClips: async () => [],
      setExcluded: async () => undefined,
      buildPool: async (mode) => {
        if (mode !== 'demo') return { error: 'no_data' as const };
        const index = buildIndex({ source: 'demo', adapter: 'demo', accountLabel: DEMO_ACCOUNT_LABEL, syncedAt: Date.now() }, demoLikes(settings.profile.deviceId, 200));
        return { source: 'demo', candidates: selectCandidates(index, { recentPlayed: new Set(recent), excluded: new Set(), max: 40 }), indexHashes: [], totalAvailable: index.likes.length };
      },
      recordPlayed: async (ids) => {
        recent = pushRecentPlayed(recent, ids);
      },
      onStatus: noop
    },
    updates: {
      check: async () => ({ kind: 'unsupported', message: 'Browser-Vorschau' }),
      download: async () => ({ kind: 'unsupported' }),
      installOnQuit: async () => undefined,
      onStatus: noop
    },
    localServer: {
      start: async () => ({ running: false, port: null, addresses: [], error: 'Nur in der Desktop-App' }),
      stop: async () => ({ running: false, port: null, addresses: [] }),
      status: async () => ({ running: false, port: null, addresses: [] })
    },
    lastRoom: {
      get: async () => {
        try {
          return JSON.parse(sessionStorage.getItem('liked-last-room') ?? 'null');
        } catch {
          return null;
        }
      },
      set: async (v) => (v ? sessionStorage.setItem('liked-last-room', JSON.stringify(v)) : sessionStorage.removeItem('liked-last-room'))
    },
    onDeepLink: noop
  };
}

export const isDesktop = typeof window !== 'undefined' && !!window.liked;
export const api: LikedApi = typeof window !== 'undefined' && window.liked ? window.liked : browserMock();
