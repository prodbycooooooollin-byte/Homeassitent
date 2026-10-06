import { useState } from 'react';
import { ITEMS, displayName, findItem, stackSize } from '../lib/items';
import { breakdown, formatBreakdown } from '../lib/stacks';
import { progress, shoppingList, load, type Store } from '../lib/store';
import type { Farm } from '../lib/types';
import { FarmCard } from './Farms';

export function Projects({ store, onOpen }: { store: Store; onOpen: (f: Farm) => void }) {
  const { state, update } = store;
  const toggleFav = (f: Farm) =>
    update((s) => ({ ...s, favorites: s.favorites.some((x) => x.id === f.id) ? s.favorites.filter((x) => x.id !== f.id) : [f, ...s.favorites] }));
  return (
    <section>
      <h2>Meine Projekte</h2>
      {state.builds.length === 0 && <p className="muted">Noch keine Projekte. Öffne ein Farmvideo und starte den Bau – dann erscheint hier deine Checkliste.</p>}
      <div className="projects">
        {state.builds.map((b) => (
          <button key={b.id} className={`project ${b.done ? 'finished' : ''}`} onClick={() => onOpen(b.farm)}>
            <img src={b.farm.thumbnail} alt="" />
            <div>
              <strong>{b.farm.title}</strong>
              <div className="bar"><div style={{ width: `${progress(b.items) * 100}%` }} /></div>
              <span className="muted small">{b.done ? '✔ Fertig' : `${Math.round(progress(b.items) * 100)} % · ${b.items.filter((i) => !i.done).length} Items offen`}{b.coords && ` · 📍 ${b.coords}`}</span>
            </div>
          </button>
        ))}
      </div>
      <h2>Favoriten</h2>
      {state.favorites.length === 0 && <p className="muted">Mit ☆ merkst du dir Videos für später.</p>}
      <div className="grid">
        {state.favorites.map((f) => (
          <FarmCard key={f.id} farm={f} version={state.version} fav active={state.builds.some((b) => b.farm.id === f.id)} onOpen={() => onOpen(f)} onFav={() => toggleFav(f)} />
        ))}
      </div>
    </section>
  );
}

export function Shopping({ store }: { store: Store }) {
  const list = shoppingList(store.state.builds);
  const lang = store.state.lang;
  const total = list.reduce((a, b) => a + b.count, 0);
  const copy = () => navigator.clipboard?.writeText(list.map((i) => `${i.count}x ${displayName(i.name, lang)}`).join('\n'));
  return (
    <section>
      <h2>Einkaufsliste</h2>
      <p className="muted">Alle noch offenen Items aus deinen aktiven Projekten, zusammengerechnet.</p>
      {list.length === 0 ? <p>Alles abgehakt – oder noch kein Projekt gestartet. 🎉</p> : (
        <>
          <table className="tbl">
            <thead><tr><th>Item</th><th>Anzahl</th><th>Stacks</th><th>Für</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.name}>
                  <td>{displayName(i.name, lang)}</td>
                  <td>{i.count}</td>
                  <td>{formatBreakdown(i.count, stackSize(i.name))}</td>
                  <td className="muted small">{[...new Set(i.from)].join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row"><button onClick={copy}>📋 Liste kopieren</button><span className="muted">{list.length} Items · {total} Stück gesamt</span></div>
        </>
      )}
    </section>
  );
}

export function Tools({ lang }: { lang: 'de' | 'en' }) {
  const [name, setName] = useState('Hopper');
  const [count, setCount] = useState(1000);
  const [perHour, setPerHour] = useState(5000);
  const [need, setNeed] = useState(2000);
  const size = stackSize(name);
  const b = breakdown(count, size);
  const hours = perHour > 0 ? need / perHour : 0;
  const mins = Math.ceil(hours * 60);
  return (
    <section>
      <h2>Werkzeuge</h2>
      <div className="tool">
        <h3>Stack-Rechner</h3>
        <div className="row">
          <input list="calc-items" value={name} onChange={(e) => setName(e.target.value)} aria-label="Item" />
          <datalist id="calc-items">{ITEMS.map((i) => <option key={i.en} value={i[lang]} />)}</datalist>
          <input className="num" type="number" min={0} value={count} onChange={(e) => setCount(Math.max(0, +e.target.value || 0))} aria-label="Anzahl" />
        </div>
        <p>
          <strong>{count}</strong> {findItem(name) ? displayName(name, lang) : name} = <strong>{formatBreakdown(count, size)}</strong>
          <span className="muted"> (Stackgröße {size}{b.shulkers ? '' : `, ${(count / (size * 27)).toFixed(2)} Shulker`})</span>
        </p>
      </div>
      <div className="tool">
        <h3>Farmdauer</h3>
        <div className="row">
          <label className="field">Benötigte Menge<input type="number" min={0} value={need} onChange={(e) => setNeed(Math.max(0, +e.target.value || 0))} /></label>
          <label className="field">Rate pro Stunde<input type="number" min={1} value={perHour} onChange={(e) => setPerHour(Math.max(1, +e.target.value || 1))} /></label>
        </div>
        <p>Dauer: <strong>{mins >= 60 ? `${Math.floor(mins / 60)} Std. ${mins % 60} Min.` : `${mins} Min.`}</strong>
          <span className="muted"> – reale Raten hängen von Chunk-Loading, Spawnregeln und Baufehlern ab.</span></p>
      </div>
    </section>
  );
}

export function Settings({ store }: { store: Store }) {
  const { state, patch, replace } = store;
  const [key, setKey] = useState(state.apiKey);
  const [msg, setMsg] = useState('');
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ ...state, apiKey: '' }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'farmfinder-backup.json';
    a.click();
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      replace({ ...load(), ...data, apiKey: state.apiKey });
      setMsg('Import erfolgreich.');
    } catch { setMsg('Datei konnte nicht gelesen werden.'); }
  };
  return (
    <section>
      <h2>Einstellungen</h2>
      <div className="tool">
        <h3>YouTube-API-Key</h3>
        <ol className="muted">
          <li>In der <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> ein Projekt anlegen.</li>
          <li>„YouTube Data API v3“ aktivieren und unter „Anmeldedaten“ einen API-Key erstellen.</li>
          <li>Empfohlen: Key auf deine Domain (HTTP-Referrer) beschränken.</li>
        </ol>
        <div className="row">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" autoComplete="off" aria-label="API-Key" />
          <button className="primary" onClick={() => { patch({ apiKey: key.trim() }); setMsg('Key gespeichert.'); }}>Speichern</button>
        </div>
        <p className="muted small">Der Key bleibt nur in diesem Browser (localStorage). Kontingent: 10 000 Einheiten/Tag, eine Suche kostet ~101 – ergibt etwa 95 Suchen pro Tag. Ergebnisse werden 24 Std. zwischengespeichert.</p>
      </div>
      <div className="tool">
        <h3>Sprache der Item-Namen</h3>
        <div className="row">
          <button className={state.lang === 'de' ? 'primary' : ''} onClick={() => patch({ lang: 'de' })}>Deutsch</button>
          <button className={state.lang === 'en' ? 'primary' : ''} onClick={() => patch({ lang: 'en' })}>English</button>
        </div>
      </div>
      <div className="tool">
        <h3>Backup</h3>
        <div className="row">
          <button onClick={exportData}>Exportieren</button>
          <label className="btn">Importieren<input type="file" accept="application/json" hidden onChange={(e) => importData(e.target.files?.[0])} /></label>
        </div>
      </div>
      {msg && <p role="status">{msg}</p>}
      <p className="muted small">Schwierigkeit und Effizienz werden aus Titel, Beschreibung, Videolänge, Aufrufen und Likes <em>geschätzt</em> – sie ersetzen keinen eigenen Blick ins Video.</p>
    </section>
  );
}
