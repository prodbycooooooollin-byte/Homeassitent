import { useCallback, useEffect, useState } from 'react';
import { parseItemList } from '../lib/analyze';
import { addMissing, newBuild, type Store } from '../lib/store';
import { fetchComments } from '../lib/youtube';
import type { Build, Farm } from '../lib/types';
import { Chest } from './Chest';
import { SchematicPanel } from './SchematicPanel';
import { DiffBadge, Stars, duration } from './Farms';

interface Props {
  farm: Farm;
  store: Store;
  onClose: () => void;
}

export function Detail({ farm, store, onClose }: Props) {
  const { state, update } = store;
  const build = state.builds.find((b) => b.farm.id === farm.id);
  const [tab, setTab] = useState<'info' | 'list' | '3d'>(build ? 'list' : 'info');
  const [comments, setComments] = useState<string[]>([]);
  const [cstate, setCstate] = useState('');
  const fav = state.favorites.some((f) => f.id === farm.id);

  const start = () => {
    update((s) => ({ ...s, builds: [newBuild(farm), ...s.builds] }));
    setTab('list');
  };
  const patchBuild = (p: Partial<Build>) =>
    update((s) => ({ ...s, builds: s.builds.map((b) => (b.farm.id === farm.id ? { ...b, ...p } : b)) }));
  const toggleFav = () =>
    update((s) => ({ ...s, favorites: fav ? s.favorites.filter((f) => f.id !== farm.id) : [farm, ...s.favorites] }));
  const addItems = useCallback(
    (list: { name: string; count: number }[]) =>
      update((st) => ({
        ...st,
        builds: st.builds.map((b) => (b.farm.id === farm.id ? { ...b, items: addMissing(b.items, list) } : b)),
      })),
    [farm.id, update],
  );
  const importDesc = () => addItems(parseItemList(farm.description));
  const importComments = () => addItems(parseItemList(comments.join('\n')));

  // Kommentare laden (Ersteller-Kommentare enthalten oft die Materialliste)
  useEffect(() => {
    if (!state.apiKey) return;
    const ac = new AbortController();
    setCstate('lädt');
    fetchComments(farm.videoId, state.apiKey, farm.channelId, ac.signal)
      .then((c) => { setComments(c); setCstate(''); })
      .catch((e) => { if (e.name !== 'AbortError') setCstate('nicht verfügbar'); });
    return () => ac.abort();
  }, [farm.videoId, farm.channelId, state.apiKey]);

  // Neues Projekt ohne Items → Liste automatisch aus Kommentaren füllen
  const commentItems = parseItemList(comments.join('\n'));
  useEffect(() => {
    if (build && build.items.length === 0 && commentItems.length >= 3) addItems(commentItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, build?.id]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={farm.title} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h2>{farm.title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${farm.videoId}`}
            title={farm.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="meta">
          <DiffBadge level={farm.difficulty} />
          <span className="muted small">Schwierigkeit</span>
          <Stars n={farm.efficiency} label="Effizienz" />
          <span className="muted small">Effizienz (geschätzt)</span>
          {farm.durationSec ? <span className="badge">{duration(farm.durationSec)}</span> : null}
          {farm.versions.map((v) => <span key={v} className="badge ver">{v}</span>)}
          <a className="badge" href={`https://www.youtube.com/watch?v=${farm.videoId}`} target="_blank" rel="noreferrer">Auf YouTube ↗</a>
          <button className={`ghost fav ${fav ? 'on' : ''}`} onClick={toggleFav}>{fav ? '★ Favorit' : '☆ Favorit'}</button>
        </div>

        <div className="tabs sub">
          <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>Beschreibung</button>
          <button className={tab === 'list' ? 'on' : ''} onClick={() => (build ? setTab('list') : start())}>
            {build ? 'Materialien & Notizen' : '+ Bau starten'}
          </button>
          <button className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}>🧱 3D-Modell</button>
        </div>

        {tab === 'info' && (
          <div className="desc">
            <p className="muted small">{farm.channel}</p>
            <pre>{farm.description || 'Keine Beschreibung geladen. Materialien kannst du nach „Bau starten“ manuell eintragen oder einfügen.'}</pre>
            {!build && <button className="primary" onClick={start}>Bau starten ({farm.items.length} Items erkannt)</button>}
          </div>
        )}

        {tab === '3d' && (
          <SchematicPanel
            title={farm.title}
            text={`${farm.description}\n${comments.join('\n')}`}
            autoApply={!!build && build.items.length === 0}
            onMaterials={(m, auto) => { if (!build) start(); addItems(m); if (!auto) setTab('list'); }}
          />
        )}

        {tab === 'list' && build && (
          <>
            <Chest items={build.items} lang={state.lang} onChange={(items) => patchBuild({ items })} />
            <div className="chips">
              {farm.description && <button className="chip" onClick={importDesc}>Items aus Beschreibung einlesen</button>}
              {state.apiKey && <button className="chip" onClick={importComments} disabled={commentItems.length === 0}>
                Items aus Kommentaren ({cstate || commentItems.length})
              </button>}
            </div>
            <label className="field">Koordinaten / Standort
              <input value={build.coords} onChange={(e) => patchBuild({ coords: e.target.value })} placeholder="x 120, y 64, z -300" />
            </label>
            <label className="field">Notizen
              <textarea rows={3} value={build.notes} onChange={(e) => patchBuild({ notes: e.target.value })} placeholder="Welche Abweichungen, Probleme, Tipps …" />
            </label>
            <div className="row">
              <button className="ghost" onClick={() => patchBuild({ done: !build.done })}>{build.done ? 'Wieder öffnen' : '✔ Als fertig markieren'}</button>
              <button className="ghost danger" onClick={() => { if (confirm('Projekt löschen?')) { update((s) => ({ ...s, builds: s.builds.filter((b) => b.id !== build.id) })); onClose(); } }}>Löschen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
