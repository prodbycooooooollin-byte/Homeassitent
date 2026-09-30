import { browserPlatform } from './browser.ts';
import { tauriPlatform } from './tauri.ts';
import type { Platform } from './types.ts';

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const platform: Platform = isDesktop ? tauriPlatform : browserPlatform;
export * from './types.ts';
