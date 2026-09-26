import { useEffect, useState } from 'react';
import { PRODUCTION_SERVER, parseServerAddress } from '../../../shared/server.ts';
import { play } from '../audio/sound.ts';
import { connection, useConnection } from '../net/connection.ts';
import { settingsStore, useProfile, useSettings } from '../state/storage.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Dialog } from '../ui/common.tsx';
import { describeConnection } from '../ui/ConnectionStatus.tsx';
import { OnboardingCards } from './Onboarding.tsx';
import { ProfileEditor } from './ProfileSetup.tsx';

async function toggleFullscreen() {
  if (window.impostorDesktop) {
    await window.impostorDesktop.toggleFullscreen();
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen?.();
}

const SOURCE_LABEL: Record<string, string> = {
  override: 'eigener Server (Erweitert)',
  desktop: 'Umgebungsvariable IMPOSTOR_SERVER_URL',
  build: 'beim Build festgelegt',
  origin: 'Server dieser Webseite',
  production: 'Standardserver',
};

function AdvancedServer() {
  const s = useSettings();
  const conn = useConnection();
  const [value, setValue] = useState(s.serverOverride);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(s.serverOverride), [s.serverOverride]);
  const status = describeConnection(conn);

  const apply = () => {
    const v = value.trim();
    if (v && !parseServerAddress(v)) {
      setError('Ungültige Adresse. Beispiel: mein-server.example.com oder ws://192.168.0.10:8787');
      return;
    }
    setError(null);
    settingsStore.set({ serverOverride: v });
    connection.restart();
  };

  return (
    <details className="advanced">
      <summary>Erweitert (nur für Entwicklung und Tests)</summary>
      <div className="advanced-body">
        <p className="muted small">
          Normalerweise nichts ändern: Die App verbindet sich automatisch mit dem Spielserver. Alle Spieler müssen denselben Server
          verwenden.
        </p>
        <dl className="kv">
          <dt>Aktueller Server</dt>
          <dd>
            <code>{conn.endpoint.httpBase}</code>
          </dd>
          <dt>Quelle</dt>
          <dd>{SOURCE_LABEL[conn.endpointSource] ?? conn.endpointSource}</dd>
          <dt>Status</dt>
          <dd>{status.title}</dd>
        </dl>
        <label className="field">
          <span className="field-label">Eigener Server</span>
          <input
            className="text-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={PRODUCTION_SERVER.replace('https://', '')}
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby="server-error"
          />
          <span id="server-error" className="field-error" role="alert">
            {error}
          </span>
        </label>
        <div className="row-actions">
          <button className="btn btn-small btn-ghost" onClick={apply} disabled={value.trim() === s.serverOverride}>
            Übernehmen & neu verbinden
          </button>
          <button
            className="btn btn-small btn-ghost"
            disabled={!s.serverOverride}
            onClick={() => {
              setValue('');
              settingsStore.set({ serverOverride: '' });
              connection.restart();
            }}
          >
            Standardserver verwenden
          </button>
        </div>
      </div>
    </details>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const profile = useProfile();
  const [view, setView] = useState<'main' | 'tutorial' | 'profile'>('main');
  useEffect(() => {
    if (!open) setView('main');
  }, [open]);

  return (
    <>
      <Dialog open={open && view === 'main'} onClose={onClose} title="Einstellungen">
        <div className="settings-dialog">
          <section className="settings-group" aria-labelledby="sg-profile">
            <h3 id="sg-profile">Profil</h3>
            <div className="profile-row">
              <Avatar id={profile.avatar} size={44} />
              <span className="profile-row-name">{profile.name || 'Kein Name'}</span>
              <button className="btn btn-small btn-ghost" onClick={() => setView('profile')}>
                Name & Figur ändern
              </button>
            </div>
          </section>

          <section className="settings-group" aria-labelledby="sg-audio">
            <h3 id="sg-audio">Ton</h3>
            <label className="slider">
              <span>Effekte</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.sfxVolume}
                onChange={(e) => settingsStore.set({ sfxVolume: Number(e.target.value) })}
                onPointerUp={() => play('click')}
                aria-valuetext={`${Math.round(s.sfxVolume * 100)} Prozent`}
              />
              <output>{Math.round(s.sfxVolume * 100)}%</output>
            </label>
            <label className="slider">
              <span>Musik</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.musicVolume}
                onChange={(e) => settingsStore.set({ musicVolume: Number(e.target.value) })}
                aria-valuetext={`${Math.round(s.musicVolume * 100)} Prozent`}
              />
              <output>{Math.round(s.musicVolume * 100)}%</output>
            </label>
            <label className="switch">
              <input type="checkbox" checked={s.muted} onChange={(e) => settingsStore.set({ muted: e.target.checked })} />
              <span className="switch-ui" aria-hidden="true" />
              <span>Alles stumm</span>
            </label>
          </section>

          <section className="settings-group" aria-labelledby="sg-view">
            <h3 id="sg-view">Anzeige & Bewegung</h3>
            <div className="setting">
              <span className="setting-label" id="rm-l">
                Reduzierte Bewegung
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="rm-l">
                {(
                  [
                    ['system', 'Wie System'],
                    ['on', 'An'],
                    ['off', 'Aus'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={s.reducedMotion === v} className={s.reducedMotion === v ? 'on' : ''} onClick={() => settingsStore.set({ reducedMotion: v })}>
                    {l}
                  </button>
                ))}
              </div>
              <span className="setting-hint-ink">„An" schaltet Karten- und Übergangsanimationen ab.</span>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => void toggleFullscreen()}>
              Vollbild umschalten (F11)
            </button>
          </section>

          <section className="settings-group" aria-labelledby="sg-privacy">
            <h3 id="sg-privacy">Privatsphäre</h3>
            <label className="switch">
              <input type="checkbox" checked={s.privacyMode} onChange={(e) => settingsStore.set({ privacyMode: e.target.checked })} />
              <span className="switch-ui" aria-hidden="true" />
              <span>Rollenkarte nur beim Gedrückthalten zeigen</span>
            </label>
            <p className="setting-hint-ink">
              Schützt vor zufälligen Blicken auf deinen Bildschirm – nicht vor Bildschirmübertragung oder absichtlichem Schummeln.
            </p>
          </section>

          <section className="settings-group" aria-labelledby="sg-help">
            <h3 id="sg-help">Hilfe</h3>
            <button className="btn btn-ghost btn-small" onClick={() => setView('tutorial')}>
              Kurzanleitung erneut ansehen
            </button>
          </section>

          <AdvancedServer />

          <div className="dialog-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Fertig
            </button>
          </div>
          <p className="muted small version">Version {__APP_VERSION__} · Einstellungen werden automatisch gespeichert.</p>
        </div>
      </Dialog>
      <Dialog open={open && view === 'tutorial'} onClose={() => setView('main')} title="Kurzanleitung">
        <OnboardingCards finishLabel="Verstanden" onFinish={() => setView('main')} />
      </Dialog>
      <Dialog open={open && view === 'profile'} onClose={() => setView('main')} title="Profil bearbeiten">
        <ProfileEditor submitLabel="Speichern" onDone={() => setView('main')} onCancel={() => setView('main')} />
      </Dialog>
    </>
  );
}
