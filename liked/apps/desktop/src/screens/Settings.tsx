import { useEffect, useState } from 'react';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { set, toast, useStore, type SettingsTab } from '../state/store';
import { Button, Dialog, Disclosure, Icon, Panel, Segmented, Toggle, useSavedFlash } from '../components/ui';
import { ProfileEditor } from './Menu';
import { ClipsPanel, TikTokPanel } from './TikTokPanel';
import type { AppSettings } from '../shared/ipc-types';

async function patch(p: Partial<AppSettings>) {
  const s = await api.settings.set(p);
  set({ settings: s });
  sound.configure(s.audio);
  return s;
}

/** Speichert und zeigt kurz „Gespeichert“ an. */
function useAutosave(): [boolean, (p: Partial<AppSettings>) => Promise<AppSettings>] {
  const [saved, flash] = useSavedFlash();
  return [
    saved,
    async (p) => {
      const s = await patch(p);
      flash();
      return s;
    }
  ];
}

function SavedNote({ saved }: { saved: boolean }) {
  return (
    <span className={`saved-note ${saved ? 'on' : ''}`} aria-live="polite">
      {saved ? (
        <>
          <Icon name="check" size={14} /> {t.settings.saved}
        </>
      ) : (
        t.profile.autosave
      )}
    </span>
  );
}

/** Zurück aus Einstellungen/Regeln: im Raum zur Lobby (die App zeigt dann den Raum), sonst zum Hauptmenü. */
export function goBackFromSubscreen() {
  set({ screen: 'menu', returnTo: 'menu' });
}

export function Settings() {
  const tab = useStore((s) => s.settingsTab);
  const inRoom = useStore((s) => !!s.session);
  const tabs = Object.entries(t.settings.tabs) as [SettingsTab, string][];
  const tabIcon: Record<SettingsTab, string> = { profile: 'user', tiktok: 'heart', clips: 'film', display: 'eye', audio: 'speaker', network: 'wifi', about: 'info' };
  return (
    <div className="screen page-screen">
      <header className="page-head">
        <Button variant="quiet" icon="arrowLeft" onClick={goBackFromSubscreen}>
          {inRoom ? t.lobby.backToLobby : t.common.back}
        </Button>
        <h2 className="screen-title">{t.settings.title}</h2>
      </header>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label={t.settings.title} aria-orientation="vertical">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              id={`tab-${k}`}
              role="tab"
              aria-selected={tab === k}
              aria-controls="settings-panel"
              tabIndex={tab === k ? 0 : -1}
              className={tab === k ? 'active' : ''}
              onClick={() => set({ settingsTab: k })}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                e.preventDefault();
                const i = tabs.findIndex(([x]) => x === tab);
                const next = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length]![0];
                set({ settingsTab: next });
                document.getElementById(`tab-${next}`)?.focus();
              }}
            >
              <Icon name={tabIcon[k]} size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content" role="tabpanel" id="settings-panel" aria-labelledby={`tab-${tab}`}>
          {tab === 'profile' && (
            <Panel title={t.profile.title}>
              <ProfileEditor />
            </Panel>
          )}
          {tab === 'tiktok' && <TikTokPanel />}
          {tab === 'clips' && <ClipsPanel />}
          {tab === 'display' && <DisplaySettings />}
          {tab === 'audio' && <AudioSettings />}
          {tab === 'network' && <NetworkSettings />}
          {tab === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  );
}

function DisplaySettings() {
  const s = useStore((st) => st.settings)!;
  const [saved, save] = useAutosave();
  const d = s.display;
  return (
    <Panel title={t.settings.tabs.display} actions={<SavedNote saved={saved} />}>
      <div className="field">
        <span className="field-label">{t.settings.theme}</span>
        <Segmented
          label={t.settings.theme}
          value={d.theme}
          options={(['dark', 'light', 'system'] as const).map((v) => ({ value: v, label: t.settings.themeOptions[v] }))}
          onChange={(v) => void save({ display: { ...d, theme: v } })}
        />
      </div>
      <div className="field">
        <span className="field-label">{t.settings.reducedMotion}</span>
        <Segmented
          label={t.settings.reducedMotion}
          value={d.reducedMotion}
          options={(['system', 'on', 'off'] as const).map((v) => ({ value: v, label: t.settings.reducedMotionOptions[v] }))}
          onChange={(v) => void save({ display: { ...d, reducedMotion: v } })}
        />
        <small className="hint">{t.settings.reducedMotionHint}</small>
      </div>
      <Toggle checked={d.effects === 'high'} label={t.settings.effects} onChange={(v) => void save({ display: { ...d, effects: v ? 'high' : 'low' } })} />
      <Toggle checked={d.fullscreen} label={t.settings.fullscreen} onChange={(v) => void save({ display: { ...d, fullscreen: v } })} />
    </Panel>
  );
}

function Slider({ label, value, muted, muteLabel, onChange, onMute }: { label: string; value: number; muted: boolean; muteLabel: string; onChange(v: number): void; onMute(m: boolean): void }) {
  const id = `sl-${label}`;
  return (
    <div className={`slider-row ${muted ? 'is-muted' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={0} max={100} value={Math.round(value * 100)} disabled={muted} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <output htmlFor={id}>{muted ? t.common.off : `${Math.round(value * 100)} %`}</output>
      <Toggle checked={muted} label={muteLabel} onChange={onMute} />
    </div>
  );
}

function AudioSettings() {
  const s = useStore((st) => st.settings)!;
  const [saved, save] = useAutosave();
  const a = s.audio;
  return (
    <div className="stack">
      <Panel title={t.settings.gameAudio} actions={<SavedNote saved={saved} />}>
        <Slider
          label={t.settings.music}
          muteLabel={t.settings.muteMusic}
          value={a.music}
          muted={a.musicMuted}
          onChange={(v) => void save({ audio: { ...a, music: v } })}
          onMute={(m) => void save({ audio: { ...a, musicMuted: m } })}
        />
        <Slider
          label={t.settings.sfx}
          muteLabel={t.settings.muteSfx}
          value={a.sfx}
          muted={a.sfxMuted}
          onChange={(v) => void save({ audio: { ...a, sfx: v } }).then(() => sound.ready())}
          onMute={(m) => void save({ audio: { ...a, sfxMuted: m } })}
        />
      </Panel>
      <Panel title={t.settings.videoAudio}>
        <p>{t.settings.videoAudioHint}</p>
        <Disclosure summary={t.common.learnMore}>
          <p className="hint">{t.settings.videoAudioMore}</p>
        </Disclosure>
        <Toggle checked={a.videoStartMuted} label={t.settings.videoStartMuted} onChange={(v) => void save({ audio: { ...a, videoStartMuted: v } })} />
      </Panel>
    </div>
  );
}

function useServerStatus(url: string): ['checking' | 'online' | 'offline', () => void] {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState('checking');
    fetch(`${url.replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(60_000) })
      .then((r) => alive && setState(r.ok ? 'online' : 'offline'))
      .catch(() => alive && setState('offline'));
    return () => {
      alive = false;
    };
  }, [url, n]);
  return [state, () => setN((x) => x + 1)];
}

/** Nur Statusanzeige: LIKED verbindet sich immer mit dem fest eingebauten Server. */
function NetworkSettings() {
  const s = useStore((st) => st.settings)!;
  const [status, recheck] = useServerStatus(s.serverUrl);
  return (
    <Panel title={t.settings.serverStatus}>
      <div className={`server-status st-${status}`} role="status">
        <Icon name={status === 'online' ? 'check' : status === 'offline' ? 'wifiOff' : 'clock'} size={18} />
        <div>
          <strong>{status === 'online' ? t.settings.serverOnline : status === 'offline' ? t.settings.serverOffline : t.settings.serverChecking}</strong>
          <code>{s.serverUrl}</code>
        </div>
        <Button size="sm" variant="quiet" icon="refresh" onClick={recheck} disabled={status === 'checking'}>
          {t.common.retry}
        </Button>
      </div>
      {status === 'checking' && <p className="hint">{t.connection.waking}</p>}
      <p className="hint">{t.settings.serverDefault}</p>
    </Panel>
  );
}

function AboutSettings() {
  const update = useStore((s) => s.update);
  const inMatch = useStore((s) => !!s.view && s.view.phase !== 'LOBBY' && s.view.phase !== 'RESULTS');
  const [version, setVersion] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  useEffect(() => {
    void api.app.info().then((i) => setVersion(i.version));
  }, []);
  const tone = update.kind === 'error' ? 'bad' : update.kind === 'none' || update.kind === 'ready' ? 'ok' : update.kind === 'available' ? 'busy' : 'idle';
  return (
    <div className="stack">
      <Panel title={t.settings.tabs.about}>
        <p>
          <strong>LIKED</strong> · {t.settings.version(version)}
        </p>
        <div className={`update-status tone-${tone}`} role="status">
          <Icon name={tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : update.kind === 'checking' || update.kind === 'downloading' ? 'clock' : 'info'} size={16} />
          <span>
            {t.settings.updateStates[update.kind]}
            {update.version ? ` · ${update.version}` : ''}
            {update.percent !== undefined && update.kind === 'downloading' ? ` · ${update.percent} %` : ''}
          </span>
        </div>
        {update.message && <p className="hint">{update.message}</p>}
        {update.notes && <pre className="notes">{update.notes}</pre>}
        <div className="button-row">
          <Button variant="secondary" icon="refresh" disabled={update.kind === 'checking' || update.kind === 'downloading'} onClick={async () => set({ update: await api.updates.check() })}>
            {t.settings.checkUpdates}
          </Button>
          {update.kind === 'available' && (
            <Button variant="primary" onClick={async () => set({ update: await api.updates.download() })}>
              {t.settings.downloadUpdate}
            </Button>
          )}
          {update.kind === 'ready' && (
            <Button variant="primary" disabled={inMatch} onClick={() => void api.updates.installOnQuit()}>
              {t.settings.installOnQuit}
            </Button>
          )}
        </div>
        <p className="hint">{t.settings.updateNoMatch}</p>
        <p className="hint">{t.settings.licenses}</p>
      </Panel>
      <Panel title={t.settings.wipe}>
        <p>{t.settings.wipeWhat}</p>
        <ul className="plain-list">
          {t.settings.wipeItems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="hint">{t.settings.wipeKeep}</p>
        <div>
          <Button variant="danger" icon="trash" onClick={() => setConfirmWipe(true)}>
            {t.settings.wipe}
          </Button>
        </div>
      </Panel>
      {confirmWipe && (
        <Dialog
          title={t.settings.wipeConfirmTitle}
          onClose={() => setConfirmWipe(false)}
          footer={
            <>
              <span className="spacer" />
              <Button variant="quiet" data-autofocus onClick={() => setConfirmWipe(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                icon="trash"
                onClick={async () => {
                  setConfirmWipe(false);
                  await api.settings.wipeLocalData();
                  set({ tiktok: await api.tiktok.overview() });
                  toast(t.settings.wipeDone);
                }}
              >
                {t.settings.wipeConfirmButton}
              </Button>
            </>
          }
        >
          <p>{t.settings.wipeWhat}</p>
          <ul className="plain-list">
            {t.settings.wipeItems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="hint">{t.settings.wipeKeep}</p>
        </Dialog>
      )}
    </div>
  );
}
