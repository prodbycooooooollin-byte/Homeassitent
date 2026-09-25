import { useEffect, useState } from 'react';
import { play } from '../audio/sound.ts';
import { connection, resolveServerUrl, useConnection } from '../net/connection.ts';
import { settingsStore, useSettings } from '../state/storage.ts';
import { Dialog } from '../ui/common.tsx';
import { OnboardingCards } from './Onboarding.tsx';

async function toggleFullscreen() {
  if (window.impostorDesktop) {
    await window.impostorDesktop.toggleFullscreen();
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen?.();
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const conn = useConnection();
  const [server, setServer] = useState(s.serverUrl);
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    if (open) setServer(s.serverUrl);
  }, [open, s.serverUrl]);

  const applyServer = () => {
    settingsStore.set({ serverUrl: server.trim() });
    connection.restart();
  };

  return (
    <>
      <Dialog open={open && !tutorial} onClose={onClose} title="Einstellungen">
        <div className="settings-dialog">
          <fieldset>
            <legend>Audio</legend>
            <label className="slider">
              <span>Effekte</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.sfxVolume}
                onChange={(e) => settingsStore.set({ sfxVolume: Number(e.target.value) })}
                onMouseUp={() => play('click')}
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
              />
              <output>{Math.round(s.musicVolume * 100)}%</output>
            </label>
            <label className="switch">
              <input type="checkbox" checked={s.muted} onChange={(e) => settingsStore.set({ muted: e.target.checked })} />
              <span className="switch-ui" aria-hidden="true" />
              <span>Alles stumm</span>
            </label>
          </fieldset>

          <fieldset>
            <legend>Anzeige & Bewegung</legend>
            <div className="setting">
              <span className="setting-label" id="rm-l">
                Reduzierte Bewegung
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="rm-l">
                {(
                  [
                    ['system', 'wie System'],
                    ['on', 'an'],
                    ['off', 'aus'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={s.reducedMotion === v} className={s.reducedMotion === v ? 'on' : ''} onClick={() => settingsStore.set({ reducedMotion: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => void toggleFullscreen()}>
              Vollbild umschalten (F11)
            </button>
          </fieldset>

          <fieldset>
            <legend>Privatsphäre</legend>
            <label className="switch">
              <input type="checkbox" checked={s.privacyMode} onChange={(e) => settingsStore.set({ privacyMode: e.target.checked })} />
              <span className="switch-ui" aria-hidden="true" />
              <span>Privatsphäre-Modus</span>
            </label>
            <p className="muted small">
              Deine Rollenkarte bleibt verdeckt und zeigt sich nur, solange du die Taste gedrückt hältst. Das schützt vor zufälligen Blicken,
              aber nicht vor Bildschirmübertragung oder absichtlichem Schummeln.
            </p>
          </fieldset>

          <fieldset>
            <legend>Spielserver</legend>
            <label className="field">
              <span className="field-label">Serveradresse (leer = Standard)</span>
              <input
                className="text-input"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="z. B. impostor.example.com oder ws://192.168.0.10:8787"
                spellCheck={false}
              />
            </label>
            <p className="muted small">
              Aktuell: {conn.serverUrl || resolveServerUrl()} · {conn.status === 'online' ? 'verbunden' : 'nicht verbunden'}
            </p>
            <button className="btn btn-small btn-ghost" onClick={applyServer} disabled={server.trim() === s.serverUrl}>
              Übernehmen & neu verbinden
            </button>
          </fieldset>

          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setTutorial(true)}>
              Anleitung erneut ansehen
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Fertig
            </button>
          </div>
          <p className="muted small version">Version {__APP_VERSION__}</p>
        </div>
      </Dialog>
      <Dialog open={open && tutorial} onClose={() => setTutorial(false)} title="Kurzanleitung">
        <OnboardingCards finishLabel="Verstanden" onFinish={() => setTutorial(false)} />
      </Dialog>
    </>
  );
}
