import { useEffect, useState } from 'react';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { set, toast, useStore, type SettingsTab } from '../state/store';
import { Button, Panel, Segmented, Toggle } from '../components/ui';
import { ProfileEditor } from './Menu';
import { TikTokPanel } from './TikTokPanel';
import type { AppSettings, LocalServerState } from '../shared/ipc-types';

async function patch(p: Partial<AppSettings>) {
  const s = await api.settings.set(p);
  set({ settings: s });
  sound.configure(s.audio);
  return s;
}

export function Settings() {
  const tab = useStore((s) => s.settingsTab);
  const inRoom = useStore((s) => !!s.session);
  const tabs = Object.entries(t.settings.tabs) as [SettingsTab, string][];
  return (
    <div className="screen settings-screen">
      <header className="settings-head">
        <Button variant="ghost" icon="arrowLeft" onClick={() => set({ screen: 'menu' })}>
          {t.common.back}
        </Button>
        <h2 className="screen-title">{t.settings.title}</h2>
      </header>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label={t.settings.title}>
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => set({ settingsTab: k })}>
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content" role="tabpanel">
          {tab === 'profile' && (
            <Panel title={t.profile.title}>
              <ProfileEditor />
            </Panel>
          )}
          {tab === 'tiktok' && <TikTokPanel />}
          {tab === 'display' && <DisplaySettings />}
          {tab === 'audio' && <AudioSettings />}
          {tab === 'network' && <NetworkSettings disabled={inRoom} />}
          {tab === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  );
}

function DisplaySettings() {
  const s = useStore((st) => st.settings)!;
  return (
    <Panel>
      <Toggle checked={s.display.fullscreen} label={t.settings.fullscreen} onChange={(v) => void patch({ display: { ...s.display, fullscreen: v } })} />
      <div className="field">
        <span>{t.settings.reducedMotion}</span>
        <Segmented
          label={t.settings.reducedMotion}
          value={s.display.reducedMotion}
          options={(['system', 'on', 'off'] as const).map((v) => ({ value: v, label: t.settings.reducedMotionOptions[v] }))}
          onChange={(v) => void patch({ display: { ...s.display, reducedMotion: v } })}
        />
      </div>
      <div className="field">
        <span>{t.settings.effects}</span>
        <Segmented
          label={t.settings.effects}
          value={s.display.effects}
          options={(['high', 'low'] as const).map((v) => ({ value: v, label: t.settings.effectsOptions[v] }))}
          onChange={(v) => void patch({ display: { ...s.display, effects: v } })}
        />
      </div>
    </Panel>
  );
}

function Slider({ label, value, muted, onChange, onMute }: { label: string; value: number; muted: boolean; onChange(v: number): void; onMute(m: boolean): void }) {
  return (
    <div className="slider-row">
      <label>
        <span>{label}</span>
        <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label} />
        <output>{Math.round(value * 100)}%</output>
      </label>
      <Toggle checked={muted} label={t.settings.mute} onChange={onMute} />
    </div>
  );
}

function AudioSettings() {
  const s = useStore((st) => st.settings)!;
  const a = s.audio;
  return (
    <>
      <Panel title={t.settings.gameAudio}>
        <Slider label={t.settings.music} value={a.music} muted={a.musicMuted} onChange={(v) => void patch({ audio: { ...a, music: v } })} onMute={(m) => void patch({ audio: { ...a, musicMuted: m } })} />
        <Slider
          label={t.settings.sfx}
          value={a.sfx}
          muted={a.sfxMuted}
          onChange={(v) => {
            void patch({ audio: { ...a, sfx: v } }).then(() => sound.ready());
          }}
          onMute={(m) => void patch({ audio: { ...a, sfxMuted: m } })}
        />
      </Panel>
      <Panel title={t.settings.videoAudio}>
        <p className="hint">{t.settings.videoAudioHint}</p>
        <Toggle checked={a.videoStartMuted} label={t.settings.videoStartMuted} onChange={(v) => void patch({ audio: { ...a, videoStartMuted: v } })} />
      </Panel>
    </>
  );
}

function NetworkSettings({ disabled }: { disabled: boolean }) {
  const s = useStore((st) => st.settings)!;
  const [url, setUrl] = useState(s.serverUrl);
  const [local, setLocal] = useState<LocalServerState | null>(null);
  const [port, setPort] = useState(47800);
  const [defaultUrl, setDefaultUrl] = useState('');
  useEffect(() => {
    void api.localServer.status().then(setLocal);
    void api.app.info().then((i) => setDefaultUrl(i.defaultServerUrl));
  }, []);
  const valid = /^https?:\/\/[^\s/]+(:\d+)?\/?$/.test(url);
  return (
    <>
      <Panel title={t.settings.serverUrl}>
        <div className="row gap">
          <input className="text-input" value={url} disabled={disabled} onChange={(e) => setUrl(e.target.value.trim())} aria-invalid={!valid} />
          <Button
            variant="primary"
            disabled={disabled || !valid || url === s.serverUrl}
            onClick={async () => {
              await patch({ serverUrl: url.replace(/\/$/, '') });
              set({ tiktok: await api.tiktok.overview() });
              toast('Gespeichert');
            }}
          >
            {t.common.confirm}
          </Button>
        </div>
        <p className="hint">{s.serverUrlCustom ? t.settings.serverCustom : t.settings.serverDefault}</p>
        {s.serverUrlCustom && defaultUrl && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={async () => {
              const next = await patch({ serverUrl: defaultUrl });
              setUrl(next.serverUrl);
              set({ tiktok: await api.tiktok.overview() });
            }}
          >
            {t.settings.useDefaultServer}
          </Button>
        )}
      </Panel>
      <Panel title={t.settings.localHost}>
        <p className="hint">{t.settings.localHostHint}</p>
        {local?.running ? (
          <>
            <p>{t.settings.localAddresses}:</p>
            <ul className="addr-list">
              {local.addresses.map((a) => (
                <li key={a}>
                  <code>{a}</code>
                  <Button size="sm" variant="ghost" onClick={() => void patch({ serverUrl: a })}>
                    {t.settings.useLocal}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="danger" onClick={async () => setLocal(await api.localServer.stop())}>
              {t.settings.localStop}
            </Button>
          </>
        ) : (
          <div className="row gap">
            <input className="text-input short" type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} aria-label="Port" />
            <Button variant="secondary" onClick={async () => setLocal(await api.localServer.start(port))}>
              {t.settings.localStart}
            </Button>
          </div>
        )}
        {local?.error && <p className="error-text">{local.error}</p>}
      </Panel>
    </>
  );
}

function AboutSettings() {
  const update = useStore((s) => s.update);
  const inMatch = useStore((s) => !!s.view && s.view.phase !== 'LOBBY' && s.view.phase !== 'RESULTS');
  const [version, setVersion] = useState('');
  useEffect(() => {
    void api.app.info().then((i) => setVersion(i.version));
  }, []);
  return (
    <>
      <Panel title={t.settings.tabs.about}>
        <p>{t.settings.version(version)}</p>
        <p className="muted">{t.settings.updateStates[update.kind]}{update.version ? ` · ${update.version}` : ''}{update.percent !== undefined && update.kind === 'downloading' ? ` · ${update.percent}%` : ''}</p>
        {update.message && <p className="hint">{update.message}</p>}
        {update.notes && <pre className="notes">{update.notes}</pre>}
        <div className="row gap wrap">
          <Button variant="secondary" icon="refresh" onClick={async () => set({ update: await api.updates.check() })}>
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
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm(t.settings.wipeConfirm)) return;
            await api.settings.wipeLocalData();
            set({ tiktok: await api.tiktok.overview() });
            toast('Lokale Spieldaten gelöscht');
          }}
        >
          {t.settings.wipe}
        </Button>
      </Panel>
    </>
  );
}
