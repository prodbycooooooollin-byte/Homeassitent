import { useEffect, useRef, useState } from 'react';
import { sortFarms, type SortKey } from '../lib/analyze';
import { FARM_TYPES, resolveQuery } from '../lib/catalog';
import type { Store } from '../lib/store';
import type { Farm } from '../lib/types';
import { VERSIONS, matchVersion } from '../lib/versions';
import { farmsForType, loadCatalog, type CatalogFile } from '../lib/catalog-data';
import { manualFarm, parseVideoId, searchFarms, youtubeSearchUrl } from '../lib/youtube';
import { FarmCard } from './Farms';

const CACHE = 'farmfinder.cache.v1';
const TTL = 24 * 3600 * 1000;

function cacheGet(q: string): Farm[] | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? '{}');
    const e = c[q];
    return e && Date.now() - e.t < TTL ? e.farms : undefined;
  } catch { return undefined; }
}
function cacheSet(q: string, farms: Farm[]) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? '{}');
    const keys = Object.keys(c);
    if (keys.length > 20) delete c[keys[0]];
    c[q] = { t: Date.now(), farms };
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch { /* Cache ist optional */ }
}

interface Props {
  store: Store;
  onOpen: (f: Farm) => void;
  goSettings: () => void;
}

export function Search({ store, onOpen, goSettings }: Props) {
  const { state, patch, update } = store;
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('balance');
  const [strict, setStrict] = useState(true);
  const [link, setLink] = useState('');
  const abort = useRef<AbortController>();
  const [catalog, setCatalog] = useState<CatalogFile>({ generated: null, entries: {} });
  useEffect(() => { void loadCatalog().then(setCatalog); }, []);

  const catalogCount = new Set(Object.values(catalog.entries).flat().map((f) => f.id)).size;
  const resolved = submitted ? resolveQuery(submitted, state.version) : undefined;

  useEffect(() => {
    if (!submitted || !resolved) return;
    const q = resolved.ytQuery;
    const cached = cacheGet(q);
    if (cached) { setFarms(cached); setError(''); return; }
    if (!state.apiKey) { setFarms(resolved.type ? farmsForType(catalog, resolved.type.id) : []); return; }
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    setLoading(true);
    setError('');
    searchFarms(q, state.apiKey, ac.signal)
      .then((f) => { setFarms(f); cacheSet(q, f); })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, state.version, state.apiKey, catalog]);

  const shown = sortFarms(
    farms.filter((f) => {
      const m = matchVersion(f.versions, state.version);
      return m === 'yes' || (!strict && m === 'unknown');
    }),
    sort,
  );
  const hidden = farms.length - shown.length;

  const addLink = async () => {
    if (!parseVideoId(link)) { setError('Das ist keine gültige YouTube-URL.'); return; }
    const f = await manualFarm(link);
    if (f) { update((s) => ({ ...s, custom: [f, ...s.custom.filter((c) => c.id !== f.id)] })); setLink(''); setError(''); onOpen(f); }
  };

  const go = (q: string) => { setQuery(q); setSubmitted(q.trim()); };

  return (
    <section>
      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); go(query); }}>
        <input autoFocus placeholder="Farm suchen – z. B. Bone Meal, Eisen, XP, Zuckerrohr …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Farm suchen" />
        <select value={state.version ?? ''} onChange={(e) => patch({ version: e.target.value || null })} aria-label="Minecraft-Version">
          {VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          <option value="">Alle Versionen</option>
        </select>
        <button className="primary" type="submit">Suchen</button>
      </form>

      <div className="chips">
        {FARM_TYPES.map((t) => (
          <button key={t.id} className={`chip ${resolved?.type?.id === t.id ? 'on' : ''}`} onClick={() => go(t.de)}>{t.emoji} {t.de}</button>
        ))}
      </div>

      {resolved?.type && <p className="muted info">{resolved.type.emoji} <strong>{resolved.type.de}</strong> – {resolved.type.info}</p>}

      {!state.apiKey && (
        <div className="notice">
          <strong>{catalogCount > 0 ? 'Du siehst den mitgelieferten Video-Katalog.' : 'Für die automatische Videosuche brauchst du einen kostenlosen YouTube-API-Key.'}</strong>
          <p>{catalogCount > 0 ? `Stand: ${catalog.generated?.slice(0, 10)} · ${catalogCount} Videos. Mit eigenem Key suchst du live nach beliebigen Begriffen.` : 'Ohne Key kannst du Videos per Link hinzufügen und alles andere nutzen.'}</p>
          <div className="row">
            <button className="primary" onClick={goSettings}>Key einrichten</button>
            {resolved && <a className="chip" href={youtubeSearchUrl(resolved.ytQuery)} target="_blank" rel="noreferrer">Auf YouTube suchen ↗</a>}
          </div>
        </div>
      )}

      <div className="row addlink">
        <input placeholder="YouTube-Link einfügen, um ein Video selbst hinzuzufügen" value={link} onChange={(e) => setLink(e.target.value)} />
        <button onClick={addLink} disabled={!link.trim()}>Hinzufügen</button>
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}
      {loading && <p className="muted">Lade Farmdesigns von YouTube …</p>}

      {farms.length > 0 && (
        <div className="toolbar">
          <label>Sortieren:&nbsp;
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="balance">Beste Balance (effizient &amp; machbar)</option>
              <option value="efficiency">Effizienteste zuerst</option>
              <option value="easy">Einfachste zuerst</option>
              <option value="popular">Beliebteste</option>
              <option value="new">Neueste</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> Nur Videos mit erkannter Version {state.version}</label>
          <span className="muted small">{shown.length} Treffer{hidden > 0 && ` · ${hidden} ausgeblendet (andere/unklare Version)`}</span>
        </div>
      )}

      {!submitted && catalogCount > 0 && (
        <div className="home">
          {FARM_TYPES.map((t) => {
            const top = sortFarms(farmsForType(catalog, t.id).filter((f) => matchVersion(f.versions, state.version) === 'yes'), 'balance').slice(0, 3);
            return top.length ? (
              <div key={t.id}>
                <h3>{t.emoji} {t.de} <button className="ghost small" onClick={() => go(t.de)}>alle ansehen →</button></h3>
                <div className="grid">
                  {top.map((f) => (
                    <FarmCard key={f.id} farm={f} version={state.version} fav={state.favorites.some((x) => x.id === f.id)}
                      active={state.builds.some((b) => b.farm.id === f.id)} onOpen={() => onOpen(f)}
                      onFav={() => update((s) => ({ ...s, favorites: s.favorites.some((x) => x.id === f.id) ? s.favorites.filter((x) => x.id !== f.id) : [f, ...s.favorites] }))} />
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}

      <div className="grid">
        {shown.map((f) => (
          <FarmCard key={f.id} farm={f} version={state.version} fav={state.favorites.some((x) => x.id === f.id)}
            active={state.builds.some((b) => b.farm.id === f.id)} onOpen={() => onOpen(f)}
            onFav={() => update((s) => ({ ...s, favorites: s.favorites.some((x) => x.id === f.id) ? s.favorites.filter((x) => x.id !== f.id) : [f, ...s.favorites] }))} />
        ))}
      </div>

      {!loading && submitted && state.apiKey && farms.length > 0 && shown.length === 0 && (
        <p className="muted">Keine Videos mit erkannter Version {state.version}. Entferne den Haken oben oder wähle eine andere Version.</p>
      )}

      {state.custom.length > 0 && (
        <>
          <h3 className="sect">Von dir hinzugefügte Videos</h3>
          <div className="grid">
            {state.custom.map((f) => (
              <FarmCard key={f.id} farm={f} version={state.version} fav={state.favorites.some((x) => x.id === f.id)}
                active={state.builds.some((b) => b.farm.id === f.id)} onOpen={() => onOpen(f)}
                onFav={() => update((s) => ({ ...s, favorites: s.favorites.some((x) => x.id === f.id) ? s.favorites.filter((x) => x.id !== f.id) : [f, ...s.favorites] }))} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
