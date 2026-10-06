import { useState } from 'react';
import { buildFarm } from '../lib/analyze';
import { newBuild, type Store } from '../lib/store';
import type { Build, Farm } from '../lib/types';
import { Chest } from './Chest';
import { DiffBadge, Stars, duration } from './Farms';

interface Props {
  farm: Farm;
  store: Store;
  onClose: () => void;
}

export function Detail({ farm, store, onClose }: Props) {
  const { state, update } = store;
  const build = state.builds.find((b) => b.farm.id === farm.id);
  const [tab, setTab] = useState<'info' | 'list'>(build ? 'list' : 'info');
  const fav = state.favorites.some((f) => f.id === farm.id);

  const start = () => {
    update((s) => ({ ...s, builds: [newBuild(farm), ...s.builds] }));
    setTab('list');
  };
  const patchBuild = (p: Partial<Build>) =>
    update((s) => ({ ...s, builds: s.builds.map((b) => (b.farm.id === farm.id ? { ...b, ...p } : b)) }));
  const toggleFav = () =>
    update((s) => ({ ...s, favorites: fav ? s.favorites.filter((f) => f.id !== farm.id) : [farm, ...s.favorites] }));
  const importDesc = () => {
    const parsed = buildFarm({ videoId: farm.videoId, title: farm.title, channel: farm.channel, thumbnail: farm.thumbnail, description: farm.description });
    if (build) patchBuild({ items: [...build.items, ...parsed.items.filter((p) => !build.items.some((i) => i.name === p.name)).map((p) => ({ ...p, id: Math.random().toString(36).slice(2, 10), done: false }))] });
  };

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
        </div>

        {tab === 'info' && (
          <div className="desc">
            <p className="muted small">{farm.channel}</p>
            <pre>{farm.description || 'Keine Beschreibung geladen. Materialien kannst du nach „Bau starten“ manuell eintragen oder einfügen.'}</pre>
            {!build && <button className="primary" onClick={start}>Bau starten ({farm.items.length} Items erkannt)</button>}
          </div>
        )}

        {tab === 'list' && build && (
          <>
            <Chest items={build.items} lang={state.lang} onChange={(items) => patchBuild({ items })} />
            {farm.description && <button className="chip" onClick={importDesc}>Items aus Videobeschreibung erneut einlesen</button>}
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
