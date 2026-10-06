import { difficultyLabel } from '../lib/analyze';
import type { Farm, Level } from '../lib/types';
import { matchVersion } from '../lib/versions';

export const Stars = ({ n, label }: { n: Level; label: string }) => (
  <span className="stars" title={`${label}: ${n}/5 (geschätzt)`} aria-label={`${label} ${n} von 5`}>
    {'★'.repeat(n)}<span className="off">{'★'.repeat(5 - n)}</span>
  </span>
);

const fmt = (n?: number) =>
  n === undefined ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mio.` : n >= 1e3 ? `${Math.round(n / 1e3)} Tsd.` : `${n}`;

export const duration = (s?: number) =>
  s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';

export function DiffBadge({ level }: { level: Level }) {
  const cls = level <= 2 ? 'easy' : level === 3 ? 'mid' : 'hard';
  return <span className={`badge ${cls}`}>{difficultyLabel(level)}</span>;
}

interface CardProps {
  farm: Farm;
  version: string | null;
  fav: boolean;
  active: boolean;
  onOpen: () => void;
  onFav: () => void;
}

export function FarmCard({ farm, version, fav, active, onOpen, onFav }: CardProps) {
  const vm = matchVersion(farm.versions, version);
  return (
    <article className="card">
      <button className="thumb" onClick={onOpen} aria-label={`${farm.title} öffnen`}>
        <img src={farm.thumbnail} alt="" loading="lazy" />
        {farm.durationSec ? <span className="dur">{duration(farm.durationSec)}</span> : null}
      </button>
      <div className="cbody">
        <h3 onClick={onOpen}>{farm.title}</h3>
        <div className="muted small">{farm.channel}{farm.views !== undefined && ` · ${fmt(farm.views)} Aufrufe`}</div>
        <div className="meta">
          <DiffBadge level={farm.difficulty} />
          <Stars n={farm.efficiency} label="Effizienz" />
          {farm.ratePerHour && <span className="badge">~{fmt(farm.ratePerHour)}/h</span>}
        </div>
        <div className="meta">
          {farm.versions.length ? farm.versions.slice(0, 3).map((v) => <span key={v} className={`badge ver ${vm === 'yes' ? 'ok' : ''}`}>{v}</span>)
            : <span className="badge warn">Version unklar</span>}
          {farm.items.length > 0 && <span className="badge">📦 {farm.items.length} Items</span>}
        </div>
        <div className="actions">
          <button className="primary" onClick={onOpen}>{active ? 'Projekt öffnen' : 'Ansehen'}</button>
          <button className={`ghost fav ${fav ? 'on' : ''}`} onClick={onFav} aria-pressed={fav} aria-label="Favorit">{fav ? '★' : '☆'}</button>
        </div>
      </div>
    </article>
  );
}
