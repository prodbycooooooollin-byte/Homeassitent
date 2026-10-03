import { useState } from 'react';
import { useApp } from '../state.tsx';
import { Notice } from '../components.tsx';
import { isDesktop, platform } from '../../platform/index.ts';
import { DEFAULT_API } from '../api.ts';
import { CATALOG_VERSION, EVIDENCE } from '../../core/catalog.ts';

export function AppSettings() {
  const app = useApp();
  const [url, setUrl] = useState(app.prefs.apiUrl ?? '');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Einstellungen</h1>
          <p className="page-sub">Kein Account nötig. Lokale Daten bleiben auf diesem Gerät.</p>
        </div>
      </div>
      <div className="grid g2">
        <div className="panel panel-pad col">
          <h3 className="panel-title">Recherche-Dienst</h3>
          <label className="field">
            API-Adresse (leer = Standard {DEFAULT_API})
            <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_API} />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => app.updatePrefs({ apiUrl: url.trim() || null })}>
            Speichern
          </button>
          <div className="small muted">Die Desktop-App enthält keine API-Schlüssel. Suche und AI-Extraktion laufen ausschließlich im zentralen Dienst.</div>
        </div>
        <div className="panel panel-pad col">
          <h3 className="panel-title">Messung</h3>
          <div className="small">
            PresentMon: <span className="mono">{app.prefs.presentMonPath ?? 'nicht gewählt'}</span>
          </div>
          {isDesktop && (
            <button
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                const p = await platform.pickExe();
                if (p) app.updatePrefs({ presentMonPath: p });
              }}
            >
              PresentMon-Konsolenanwendung wählen …
            </button>
          )}
          <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => void platform.openUrl('https://github.com/GameTechDev/PresentMon/releases')}>
            Offizielle PresentMon-Releases öffnen
          </button>
        </div>
        <div className="panel panel-pad col">
          <h3 className="panel-title">Einstellungskatalog</h3>
          <div className="small">Version {CATALOG_VERSION}</div>
          {Object.values(EVIDENCE).map((e) => (
            <div key={e.id} className="small">
              <button className="src-link" onClick={() => void platform.openUrl(e.url)}>
                {e.title}
              </button>{' '}
              <span className="muted">({e.date})</span>
            </div>
          ))}
        </div>
        <div className="panel panel-pad col">
          <h3 className="panel-title">Hinweise</h3>
          <Notice kind="info">CITADEL ist ein Community-Werkzeug und steht in keiner Verbindung zu Valve. Änderungen erfolgen auf eigene Verantwortung – vor jedem Schreiben wird ein Backup angelegt.</Notice>
          <div className="small muted">Bewegungen werden reduziert, wenn Windows „Animationen anzeigen“ deaktiviert ist.</div>
        </div>
      </div>
    </div>
  );
}
