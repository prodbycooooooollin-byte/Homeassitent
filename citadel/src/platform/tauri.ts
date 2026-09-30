import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { HardwareSnapshot } from '../core/models.ts';
import type { Platform } from './types.ts';

export const tauriPlatform: Platform = {
  kind: 'desktop',
  detectInstallations: () => invoke('detect_installations'),
  registerInstallation: (path) => invoke('register_installation', { path }),
  async pickFolder() {
    const r = await open({ directory: true, multiple: false, title: 'Deadlock-Ordner wählen (…/steamapps/common/Deadlock)' });
    return typeof r === 'string' ? r : null;
  },
  async pickExe() {
    const r = await open({ multiple: false, title: 'PresentMon-Konsolenanwendung wählen', filters: [{ name: 'PresentMon', extensions: ['exe'] }] });
    return typeof r === 'string' ? r : null;
  },
  readConfig: (root, relPath) => invoke('read_config', { root, relPath }),
  gameRunning: () => invoke('game_running'),
  apply: (req) => invoke('apply_changes', { req }),
  snapshot: (req) => invoke('snapshot_backup', { req }),
  listBackups: () => invoke('list_backups'),
  backupText: (id, kind) => invoke('backup_text', { id, kind }),
  restoreBackup: (id, currentBuild, kinds) => invoke('restore_backup', { id, currentBuild, kinds: kinds ?? null }),
  markBackupWorking: (id, how) => invoke('mark_backup_working', { id, how }),
  hardware: () => invoke<HardwareSnapshot>('hardware_snapshot'),
  store: {
    put: (coll, id, value) => invoke('store_put', { coll, id, json: JSON.stringify(value) }),
    async get<T>(coll: string, id: string) {
      const s = await invoke<string | null>('store_get', { coll, id });
      return s ? (JSON.parse(s) as T) : null;
    },
    async list<T>(coll: string) {
      const l = await invoke<string[]>('store_list', { coll });
      return l.map((s) => JSON.parse(s) as T);
    },
    delete: (coll, id) => invoke('store_delete', { coll, id }),
  },
  startupNotes: () => invoke('startup_notes'),
  async openUrl(url) {
    if (!/^https:\/\//.test(url)) throw new Error('Nur https-Links');
    await openUrl(url);
  },
  openWindowsSettings: (uri) => invoke('open_windows_settings', { uri }),
  runPresentMon: (exe, seconds) => invoke('run_presentmon', { exePath: exe, seconds }),
};
