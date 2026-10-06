import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { downloadFile, isDesktop } from '../lib/bridge';
import { parseLitematic, type SchematicModel } from '../lib/litematic';
import { findSchematicLinks } from '../lib/links';

const Viewer3D = lazy(() => import('./Viewer3D'));

interface Props {
  title: string;
  /** Beschreibung + Kommentare, in denen nach Links gesucht wird */
  text: string;
  onMaterials: (m: { name: string; count: number }[], auto: boolean) => void;
  /** wird nach dem ersten erfolgreichen Laden automatisch aufgerufen */
  autoApply: boolean;
}

export function SchematicPanel({ title, text, onMaterials, autoApply }: Props) {
  const links = findSchematicLinks(text);
  const [model, setModel] = useState<SchematicModel | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const autoTried = useRef('');
  const applied = useRef(false);

  const load = useCallback(async (get: () => Promise<ArrayBuffer>, name: string) => {
    setBusy(name); setError('');
    try {
      const m = await parseLitematic(await get(), title);
      if (!m.totalBlocks) throw new Error('Die Datei enthält keine Blöcke.');
      setModel(m);
      if (autoApply && !applied.current) { applied.current = true; onMaterials(m.materials, true); }
    } catch (e) {
      setError(
        `${(e as Error).message || 'Fehler'} – ${isDesktop() ? 'Der Link liefert keine direkte Litematica-Datei (z. B. Vorschauseite).' : 'Im Browser blockieren viele Hoster den Direktzugriff.'} Lade die Datei manuell herunter und lege sie unten ab.`,
      );
    } finally { setBusy(''); }
  }, [title, autoApply, onMaterials]);

  const fromUrl = (url: string) => load(() => downloadFile(url), url);
  const fromFile = (f?: File) => f && load(() => f.arrayBuffer(), f.name);

  // direkter .litematic-Link in der Beschreibung → automatisch laden
  const first = links.find((l) => l.direct);
  useEffect(() => {
    if (first && autoTried.current !== first.url) { autoTried.current = first.url; void fromUrl(first.url); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.url]);

  return (
    <div>
      {links.length > 0 && (
        <div className="links">
          <strong>Gefundene Links</strong>
          {links.map((l) => (
            <div key={l.url} className="l">
              <span className="badge">{l.direct ? '🧱 .litematic' : l.label}</span>
              <a className="u" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
              <button disabled={!!busy} onClick={() => fromUrl(l.url)}>{l.direct ? 'Laden' : 'Versuchen'}</button>
            </div>
          ))}
        </div>
      )}
      {links.length === 0 && <p className="muted">Keine Litematica-Datei in der Beschreibung gefunden. Du kannst eine Datei selbst ablegen.</p>}
      {busy && <p className="muted" role="status">Lade {busy.slice(0, 60)} …</p>}
      {error && <div className="notice err" role="alert">{error}</div>}

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void fromFile(e.dataTransfer.files[0]); }}
      >
        <label className="btn">.litematic-Datei wählen
          <input type="file" accept=".litematic" hidden onChange={(e) => void fromFile(e.target.files?.[0])} />
        </label>
        <div className="muted small">oder hierher ziehen</div>
      </div>

      {model && (
        <>
          <Suspense fallback={<p className="muted">3D-Ansicht wird geladen …</p>}>
            <Viewer3D model={model} />
          </Suspense>
          <div className="row">
            <button className="primary" onClick={() => onMaterials(model.materials, false)}>
              Materialliste übernehmen ({model.materials.length} Items)
            </button>
          </div>
          <table className="tbl">
            <thead><tr><th>Material</th><th>Anzahl</th></tr></thead>
            <tbody>{model.materials.slice(0, 40).map((m) => <tr key={m.name}><td>{m.name}</td><td>{m.count}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
