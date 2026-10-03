import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import type { ClueCard, PlayerPublic } from '../../../shared/protocol.ts';
import { settingsStore, useSettings } from '../state/storage.ts';
import { Avatar } from '../ui/Avatar.tsx';

/**
 * Geordnete, scrollbare Kartenhistorie mit klaren Durchgangsgrenzen.
 * Alternative Ansicht „nach Person" (Matrix) hält auch 120 Hinweise übersichtlich.
 */
export function History({
  clues,
  seatOrder,
  players,
  currentRound,
  maxRounds,
  title = 'Hinweise',
}: {
  clues: ClueCard[];
  seatOrder: string[];
  players: PlayerPublic[];
  currentRound: number;
  maxRounds: number;
  title?: string;
}) {
  const { historyView } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const rounds = useMemo(() => {
    const m = new Map<number, ClueCard[]>();
    for (const c of clues) {
      if (!m.has(c.round)) m.set(c.round, []);
      m.get(c.round)!.push(c);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [clues]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && historyView === 'rounds') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [clues.length, historyView]);

  const name = (id: string) => byId.get(id)?.name ?? 'Ehemalige Person';

  return (
    <section className="history" aria-label={title}>
      <div className="history-head">
        <h2 className="panel-mini-title">
          {title} <span className="count">{clues.filter((c) => c.text).length}</span>
        </h2>
        <div className="segmented tiny" role="radiogroup" aria-label="Ansicht">
          <button role="radio" aria-checked={historyView === 'rounds'} className={historyView === 'rounds' ? 'on' : ''} onClick={() => settingsStore.set({ historyView: 'rounds' })}>
            Durchgänge
          </button>
          <button role="radio" aria-checked={historyView === 'players'} className={historyView === 'players' ? 'on' : ''} onClick={() => settingsStore.set({ historyView: 'players' })}>
            Personen
          </button>
        </div>
      </div>
      <div className="history-scroll" ref={scrollRef} tabIndex={0} aria-label="Hinweisverlauf">
        {clues.length === 0 && <p className="muted small history-empty">Noch keine Hinweise. Die erste Karte landet gleich hier.</p>}
        {historyView === 'rounds' ? (
          rounds.map(([round, list]) => (
            <div className="round-group" key={round}>
              <div className="round-divider">
                <span>
                  Durchgang {round}
                  {maxRounds ? ` / ${maxRounds}` : ''}
                </span>
                {round === currentRound && <span className="now">läuft</span>}
              </div>
              <ol className="clue-list">
                {list.map((c) => (
                  <motion.li
                    key={c.id}
                    className={`clue-mini paper ${c.text ? '' : 'empty'}`}
                    initial={{ opacity: 0, x: 24, rotate: 3 }}
                    animate={{ opacity: 1, x: 0, rotate: 0 }}
                    transition={{ duration: 0.25, delay: 0.25 }}
                  >
                    <Avatar id={byId.get(c.playerId)?.avatar ?? 0} size={24} />
                    <span className="clue-author">{name(c.playerId)}</span>
                    <span className="clue-text">{c.text ?? 'Kein Hinweis abgegeben'}</span>
                  </motion.li>
                ))}
              </ol>
            </div>
          ))
        ) : (
          <div className="matrix">
            {seatOrder.map((pid) => {
              const list = clues.filter((c) => c.playerId === pid);
              return (
                <div className="matrix-row" key={pid}>
                  <div className="matrix-who">
                    <Avatar id={byId.get(pid)?.avatar ?? 0} size={24} />
                    <span>{name(pid)}</span>
                  </div>
                  <div className="matrix-cells">
                    {list.length === 0 && <span className="muted small">–</span>}
                    {list.map((c) => (
                      <span key={c.id} className={`matrix-cell ${c.text ? '' : 'empty'}`} title={`Durchgang ${c.round}`}>
                        <sup>{c.round}</sup>
                        {c.text ?? '—'}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
