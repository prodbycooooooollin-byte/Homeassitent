// Zentraler App-Zustand: Installation, eingelesene Dateien, Entwurf (je Datei ein Text),
// Anwenden-Ablauf mit Konfliktbehandlung, Profile, Einstellungen.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { platform, errorMessage, isPlatformError, type InstallationInfo, type ApplyOutcome } from '../platform/index.ts';
import { applicableText, applyToText, buildChangeSet, readValues, semanticDiff, type ChangeSet, type Draft, type LoadedFile, type SetRequest } from '../core/config.ts';
import type { ConfigFileKind } from '../core/catalog.ts';
import type { ConfigProfile } from '../core/profiles.ts';
import type { HardwareSnapshot } from '../core/models.ts';
import type { Goals } from '../core/recommendations.ts';
import { sha256Hex } from '../core/text.ts';
import { snapshotState, type InstallState } from '../core/patch.ts';

export const KINDS: ConfigFileKind[] = ['video.txt', 'gameinfo.gi', 'autoexec.cfg'];
export const REL: Record<ConfigFileKind, string> = {
  'video.txt': 'game/citadel/cfg/video.txt',
  'gameinfo.gi': 'game/citadel/gameinfo.gi',
  'autoexec.cfg': 'game/citadel/cfg/autoexec.cfg',
};

export type Route = 'overview' | 'studio' | 'optimize' | 'crosshairs' | 'players' | 'benchmarks' | 'backups' | 'settings';

export interface Prefs {
  followed: string[];
  favoriteCrosshairs: string[];
  recentCrosshairs: string[];
  presentMonPath: string | null;
  apiUrl: string | null;
  lastSeenChangeId: number;
  selectedInstallationId: string | null;
  manualInstallPaths: string[];
}

const DEFAULT_PREFS: Prefs = { followed: [], favoriteCrosshairs: [], recentCrosshairs: [], presentMonPath: null, apiUrl: null, lastSeenChangeId: 0, selectedInstallationId: null, manualInstallPaths: [] };

export interface LastApply {
  installationId: string;
  at: string;
  backupId: string;
  buildId: string | null;
  values: { file: ConfigFileKind; key: string; value: string }[];
  restartRequired: boolean;
  confirmed: null | { at: string; how: 'user' | 'game-kept-values' };
  gameResetValues?: string[];
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

interface Ctx {
  route: Route;
  go(r: Route): void;
  installations: InstallationInfo[];
  installation: InstallationInfo | null;
  workspaceMode: 'installation' | 'import' | 'none';
  files: LoadedFile[];
  readOnlyReasons: Partial<Record<ConfigFileKind, string>>;
  draft: Draft;
  reasons: Record<string, string>;
  changeSet: ChangeSet;
  pendingCount: number;
  gameRunning: boolean | null;
  busy: string | null;
  profiles: ConfigProfile[];
  hardware: HardwareSnapshot | null;
  goals: Goals;
  prefs: Prefs;
  lastApply: LastApply | null;
  installState: InstallState | null;
  startupNotes: string[];
  toasts: Toast[];
  reviewOpen: boolean;
  setReviewOpen(v: boolean): void;
  toast(kind: Toast['kind'], text: string): void;
  detect(): Promise<void>;
  chooseInstallation(i: InstallationInfo): Promise<void>;
  pickInstallationFolder(): Promise<void>;
  reload(): Promise<void>;
  importFiles(files: { kind: ConfigFileKind; name: string; text: string }[]): Promise<void>;
  setDraftText(kind: ConfigFileKind, text: string): void;
  setValues(kind: ConfigFileKind, reqs: SetRequest[], reason?: string): void;
  setValuesMulti(reqs: SetRequest[], reason?: string): { applied: number; skipped: string[] };
  resetDraft(kind?: ConfigFileKind): void;
  apply(): Promise<ApplyOutcome | null>;
  reloadAndMerge(): Promise<void>;
  confirmWorking(): Promise<void>;
  saveProfile(p: ConfigProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  setHardware(h: HardwareSnapshot | null): void;
  setGoals(g: Goals): void;
  updatePrefs(p: Partial<Prefs>): void;
  refreshGameRunning(): Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;

async function loadFile(inst: InstallationInfo, kind: ConfigFileKind): Promise<{ file: LoadedFile; readOnly?: string }> {
  const r = await platform.readConfig(inst.root, REL[kind]);
  return {
    file: { kind, path: `${inst.root}/${REL[kind]}`, text: r.text, bom: r.bom, sha256: r.sha256 ?? '', readAt: new Date().toISOString(), exists: r.exists },
    readOnly: r.encodingOk ? undefined : 'Datei ist kein gültiges UTF-8 und wird nur angezeigt.',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => (location.hash.slice(1) as Route) || 'overview');
  const [installations, setInstallations] = useState<InstallationInfo[]>([]);
  const [installation, setInstallation] = useState<InstallationInfo | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<Ctx['workspaceMode']>('none');
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [readOnlyReasons, setReadOnly] = useState<Ctx['readOnlyReasons']>({});
  const [draft, setDraft] = useState<Draft>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [gameRunning, setGameRunning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [hardware, setHardwareS] = useState<HardwareSnapshot | null>(null);
  const [goals, setGoalsS] = useState<Goals>({ targetFps: null, quality: 'ausgewogen', problem: 'keins' });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [lastApply, setLastApply] = useState<LastApply | null>(null);
  const [installState, setInstallState] = useState<InstallState | null>(null);
  const [startupNotes, setStartupNotes] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const toastId = useRef(0);

  const go = useCallback((r: Route) => {
    setRoute(r);
    history.replaceState(null, '', `#${r}`);
  }, []);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 4500);
  }, []);

  const updatePrefs = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      void platform.store.put('settings', 'prefs', next);
      return next;
    });
  }, []);

  const loadWorkspace = useCallback(async (inst: InstallationInfo) => {
    const loaded = await Promise.all(KINDS.map((k) => loadFile(inst, k)));
    const fs = loaded.map((l) => l.file);
    setFiles(fs);
    setReadOnly(Object.fromEntries(loaded.filter((l) => l.readOnly).map((l) => [l.file.kind, l.readOnly])));
    setDraft(Object.fromEntries(fs.map((f) => [f.kind, f.text])));
    setReasons({});
    setWorkspaceMode('installation');
    const la = await platform.store.get<LastApply>('install-state', `last-apply-${inst.id}`);
    setLastApply(la);
    // Patch-Check-Grundlage: gespeicherter Zustand je Installation
    const prev = await platform.store.get<InstallState>('install-state', inst.id);
    const cur = snapshotState(inst.buildId, fs.map((f) => ({ kind: f.kind, sha256: f.exists ? f.sha256 : null, text: f.exists ? f.text : null })));
    setInstallState(prev);
    if (!prev) await platform.store.put('install-state', inst.id, cur);
    // Definierte Übernahmeprüfung: Datei seither vom Spiel neu geschrieben und Werte noch vorhanden?
    if (la && !la.confirmed) {
      const vf = fs.find((f) => f.kind === 'video.txt');
      const videoVals = la.values.filter((v) => v.file === 'video.txt');
      if (vf && videoVals.length) {
        const r = await platform.readConfig(inst.root, REL['video.txt']);
        const modifiedAfter = r.modified && Date.parse(r.modified) > Date.parse(la.at) + 2000;
        if (modifiedAfter) {
          const vals = readValues('video.txt', r.text);
          const lost = videoVals.filter((v) => vals.get(v.key.toLowerCase())?.value !== v.value).map((v) => v.key);
          const next: LastApply = lost.length ? { ...la, gameResetValues: lost } : { ...la, confirmed: { at: new Date().toISOString(), how: 'game-kept-values' } };
          setLastApply(next);
          await platform.store.put('install-state', `last-apply-${inst.id}`, next);
          if (!lost.length) {
            try {
              await platform.markBackupWorking(la.backupId, 'game-kept-values');
            } catch {
              /* ignorieren */
            }
          }
        }
      }
    }
  }, []);

  const detect = useCallback(async () => {
    if (platform.kind !== 'desktop') return;
    setBusy('Suche Deadlock-Installationen …');
    try {
      const found = await platform.detectInstallations();
      const manual: InstallationInfo[] = [];
      const p = (await platform.store.get<Prefs>('settings', 'prefs')) || DEFAULT_PREFS;
      for (const path of p.manualInstallPaths) {
        try {
          const i = await platform.registerInstallation(path);
          if (!found.some((f) => f.id === i.id)) manual.push(i);
        } catch {
          /* Ordner nicht mehr vorhanden */
        }
      }
      const all = [...found, ...manual];
      setInstallations(all);
      const pick = all.find((i) => i.id === p.selectedInstallationId) || (all.length === 1 ? all[0] : null);
      if (pick) {
        setInstallation(pick);
        await loadWorkspace(pick);
      }
    } catch (e) {
      toast('error', `Erkennung fehlgeschlagen: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }, [loadWorkspace, toast]);

  const refreshGameRunning = useCallback(async () => {
    setGameRunning(await platform.gameRunning());
  }, []);

  // Start: Einstellungen, Profile, Hinweise laden; Installation suchen. Keine Dauerabfragen.
  useEffect(() => {
    void (async () => {
      const p = await platform.store.get<Prefs>('settings', 'prefs');
      if (p) setPrefs({ ...DEFAULT_PREFS, ...p });
      setProfiles(await platform.store.list<ConfigProfile>('profiles'));
      const hw = await platform.store.get<HardwareSnapshot>('settings', 'hardware');
      if (hw) setHardwareS(hw);
      const g = await platform.store.get<Goals>('settings', 'goals');
      if (g) setGoalsS(g);
      setStartupNotes(await platform.startupNotes());
      await detect();
      await refreshGameRunning();
    })();
    const onFocus = () => void refreshGameRunning();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [detect, refreshGameRunning]);

  const chooseInstallation = useCallback(
    async (i: InstallationInfo) => {
      setInstallation(i);
      updatePrefs({ selectedInstallationId: i.id });
      setBusy('Lese Config-Dateien …');
      try {
        await loadWorkspace(i);
      } catch (e) {
        toast('error', errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [loadWorkspace, toast, updatePrefs],
  );

  const pickInstallationFolder = useCallback(async () => {
    const path = await platform.pickFolder();
    if (!path) return;
    try {
      const i = await platform.registerInstallation(path);
      setInstallations((l) => (l.some((x) => x.id === i.id) ? l : [...l, i]));
      updatePrefs({ manualInstallPaths: [...new Set([...prefs.manualInstallPaths, i.root])] });
      await chooseInstallation(i);
    } catch (e) {
      toast('error', errorMessage(e));
    }
  }, [chooseInstallation, prefs.manualInstallPaths, toast, updatePrefs]);

  const reload = useCallback(async () => {
    if (installation) await loadWorkspace(installation);
  }, [installation, loadWorkspace]);

  const importFiles = useCallback(async (list: { kind: ConfigFileKind; name: string; text: string }[]) => {
    // Import-Arbeitsbereich (ohne Installation, z. B. Browser): Dateien werden bearbeitet und exportiert.
    const now = new Date().toISOString();
    const loaded: LoadedFile[] = await Promise.all(
      KINDS.map(async (k) => {
        const f = list.find((x) => x.kind === k);
        return { kind: k, path: f?.name || k, text: f?.text ?? '', bom: false, sha256: f ? await sha256Hex(f.text) : '', readAt: now, exists: Boolean(f) };
      }),
    );
    setInstallation(null);
    setFiles(loaded);
    setReadOnly({});
    setDraft(Object.fromEntries(loaded.map((f) => [f.kind, f.text])));
    setReasons({});
    setWorkspaceMode('import');
  }, []);

  const setDraftText = useCallback((kind: ConfigFileKind, text: string) => setDraft((d) => ({ ...d, [kind]: text })), []);

  const setValues = useCallback(
    (kind: ConfigFileKind, reqs: SetRequest[], reason?: string) => {
      setDraft((d) => {
        try {
          return { ...d, [kind]: applyToText(kind, d[kind] ?? '', reqs) };
        } catch (e) {
          toast('error', errorMessage(e));
          return d;
        }
      });
      if (reason) setReasons((r) => ({ ...r, ...Object.fromEntries(reqs.map((q) => [q.settingId, reason])) }));
    },
    [toast],
  );

  const setValuesMulti = useCallback(
    (reqs: SetRequest[], reason?: string) => {
      const byFile = new Map<ConfigFileKind, SetRequest[]>();
      const skipped: string[] = [];
      for (const q of reqs) {
        const kind = q.settingId.startsWith('video.') ? 'video.txt' : q.settingId.startsWith('gi.') ? 'gameinfo.gi' : 'autoexec.cfg';
        byFile.set(kind, [...(byFile.get(kind) || []), q]);
      }
      let applied = 0;
      const next = { ...draft };
      for (const [kind, list] of byFile) {
        for (const q of list) {
          try {
            next[kind] = applyToText(kind, next[kind] ?? '', [q]);
            applied++;
          } catch (e) {
            skipped.push(`${q.settingId}: ${errorMessage(e)}`);
          }
        }
      }
      setDraft(next);
      if (reason) setReasons((r) => ({ ...r, ...Object.fromEntries(reqs.map((q) => [q.settingId, reason])) }));
      return { applied, skipped };
    },
    [draft],
  );

  const resetDraft = useCallback(
    (kind?: ConfigFileKind) => {
      setDraft((d) => (kind ? { ...d, [kind]: files.find((f) => f.kind === kind)?.text ?? '' } : Object.fromEntries(files.map((f) => [f.kind, f.text]))));
      if (!kind) setReasons({});
    },
    [files],
  );

  const changeSet = useMemo(() => buildChangeSet(files, draft, reasons), [files, draft, reasons]);
  const pendingCount = changeSet.files.reduce((n, f) => n + Math.max(f.items.length, f.otherLineChanges ? 1 : 0), 0);

  const apply = useCallback(async (): Promise<ApplyOutcome | null> => {
    if (!installation) return null;
    const running = await platform.gameRunning();
    setGameRunning(running);
    if (running) {
      toast('info', 'Deadlock läuft – die Änderungen bleiben als Entwurf vorgemerkt. Nach dem Beenden des Spiels erneut „Änderungen anwenden“.');
      return null;
    }
    const writes = changeSet.files
      .map((f) => ({ f, text: applicableText(f) }))
      .filter((x) => x.text !== null && x.text !== x.f.beforeText && !readOnlyReasons[x.f.kind]);
    if (!writes.length) {
      toast('info', 'Keine anwendbaren Änderungen.');
      return null;
    }
    setBusy('Backup, Schreiben und Rücklesen …');
    try {
      const summary = writes.flatMap((w) => w.f.items.filter((i) => !i.blocked).map((i) => `${w.f.kind}: ${i.def?.label || i.key} ${i.before ?? '—'} → ${i.after ?? '—'}`));
      const out = await platform.apply({
        installRoot: installation.root,
        installationId: installation.id,
        buildId: installation.buildId,
        changeSetId: changeSet.id,
        reason: 'Änderungen aus CITADEL angewendet',
        changeSummary: summary,
        files: writes.map((w) => ({ relPath: REL[w.f.kind], text: w.text, bom: w.f.bom, expectedSha256: w.f.existed ? w.f.beforeSha256 : null })),
      });
      const values = writes.flatMap((w) => semanticDiff(w.f.kind, w.f.beforeText, w.text!).filter((c) => c.after !== undefined).map((c) => ({ file: w.f.kind, key: c.key, value: c.after! })));
      const la: LastApply = {
        installationId: installation.id,
        at: new Date().toISOString(),
        backupId: out.backupId,
        buildId: installation.buildId,
        values,
        restartRequired: writes.some((w) => w.f.items.some((i) => i.restartRequired)),
        confirmed: null,
      };
      await platform.store.put('install-state', `last-apply-${installation.id}`, la);
      await loadWorkspace(installation); // erneutes Einlesen = Kontrolle
      setLastApply(la);
      const blockedLeft = changeSet.files.some((f) => f.items.some((i) => i.blocked));
      toast('ok', `Gespeichert und zurückgelesen (${out.files.length} Datei${out.files.length > 1 ? 'en' : ''}). Backup ${out.backupId}.${la.restartRequired ? ' Neustart des Spiels erforderlich.' : ''}${blockedLeft ? ' Blockierte Einträge wurden nicht geschrieben.' : ''}`);
      return out;
    } catch (e) {
      if (isPlatformError(e) && e.code === 'conflict') toast('error', `${e.message}. Bitte „Neu einlesen und zusammenführen“.`);
      else toast('error', errorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, [changeSet, installation, loadWorkspace, readOnlyReasons, toast]);

  /** Konflikt: Dateien neu einlesen und die Katalog-Änderungen des Entwurfs auf den neuen Stand übertragen. */
  const reloadAndMerge = useCallback(async () => {
    if (!installation) return;
    const edits = changeSet.files.map((f) => ({ kind: f.kind, items: f.items.filter((i) => i.def && !i.blocked), other: f.otherLineChanges }));
    const loaded = await Promise.all(KINDS.map((k) => loadFile(installation, k)));
    const fs = loaded.map((l) => l.file);
    setFiles(fs);
    const next: Draft = Object.fromEntries(fs.map((f) => [f.kind, f.text]));
    const lost: string[] = [];
    for (const e of edits) {
      const reqs = e.items.map((i) => ({ settingId: i.def!.id, value: i.after ?? null }));
      if (reqs.length) {
        try {
          next[e.kind] = applyToText(e.kind, next[e.kind] ?? '', reqs);
        } catch (err) {
          lost.push(`${e.kind}: ${errorMessage(err)}`);
        }
      }
      if (e.other) lost.push(`${e.kind}: freie Textänderungen aus dem Expertenmodus`);
    }
    setDraft(next);
    toast(lost.length ? 'error' : 'ok', lost.length ? `Neu eingelesen. Nicht automatisch übertragbar: ${lost.join('; ')}` : 'Neu eingelesen, Änderungen auf den aktuellen Stand übertragen. Bitte erneut prüfen.');
  }, [changeSet, installation, toast]);

  const confirmWorking = useCallback(async () => {
    if (!installation || !lastApply) return;
    try {
      await platform.snapshot({ installRoot: installation.root, installationId: installation.id, buildId: installation.buildId, reason: 'Vom Nutzer bestätigt funktionierender Stand', relPaths: KINDS.map((k) => REL[k]), working: 'user' });
      const next = { ...lastApply, confirmed: { at: new Date().toISOString(), how: 'user' as const } };
      setLastApply(next);
      await platform.store.put('install-state', `last-apply-${installation.id}`, next);
      await platform.store.put('install-state', installation.id, snapshotState(installation.buildId, files.map((f) => ({ kind: f.kind, sha256: f.exists ? f.sha256 : null, text: f.exists ? f.text : null }))));
      toast('ok', 'Als funktionierender Stand gesichert.');
    } catch (e) {
      toast('error', errorMessage(e));
    }
  }, [files, installation, lastApply, toast]);

  const saveProfile = useCallback(async (p: ConfigProfile) => {
    await platform.store.put('profiles', p.id, p);
    setProfiles((l) => [...l.filter((x) => x.id !== p.id), p]);
  }, []);
  const deleteProfile = useCallback(async (id: string) => {
    await platform.store.delete('profiles', id);
    setProfiles((l) => l.filter((x) => x.id !== id));
  }, []);
  const setHardware = useCallback((h: HardwareSnapshot | null) => {
    setHardwareS(h);
    if (h) void platform.store.put('settings', 'hardware', h);
  }, []);
  const setGoals = useCallback((g: Goals) => {
    setGoalsS(g);
    void platform.store.put('settings', 'goals', g);
  }, []);

  const value: Ctx = {
    route,
    go,
    installations,
    installation,
    workspaceMode,
    files,
    readOnlyReasons,
    draft,
    reasons,
    changeSet,
    pendingCount,
    gameRunning,
    busy,
    profiles,
    hardware,
    goals,
    prefs,
    lastApply,
    installState,
    startupNotes,
    toasts,
    reviewOpen,
    setReviewOpen,
    toast,
    detect,
    chooseInstallation,
    pickInstallationFolder,
    reload,
    importFiles,
    setDraftText,
    setValues,
    setValuesMulti,
    resetDraft,
    apply,
    reloadAndMerge,
    confirmWorking,
    saveProfile,
    deleteProfile,
    setHardware,
    setGoals,
    updatePrefs,
    refreshGameRunning,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
