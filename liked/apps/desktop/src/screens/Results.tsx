import { motion } from 'motion/react';
import type { RoomView } from '@liked/protocol';
import { t } from '../i18n/de';
import { actions, leaveRoom } from '../lib/net';
import { useStore } from '../state/store';
import { Avatar, Button, DemoBadge, Icon, Panel } from '../components/ui';

export function ResultsScreen({ view }: { view: RoomView }) {
  const res = view.results!;
  const reduced = useStore((s) => s.reducedMotion);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const podium = res.standings.filter((s) => s.place <= 3).slice(0, 3);
  // Podestreihenfolge: 2 – 1 – 3
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as typeof podium;
  const me = res.standings.find((s) => s.playerId === view.youId);
  const isHost = view.hostId === view.youId;
  const nameOf = (id: string) => byId.get(id)?.name ?? '?';

  return (
    <div className="screen results-screen">
      <header className="results-head">
        <h2 className="screen-title">
          <Icon name="trophy" size={34} /> {t.results.title}
        </h2>
        {view.mode === 'demo' && <DemoBadge text={t.lobby.demoBadge} />}
        {res.endReason !== 'complete' && <p className="hint warn">{t.results.endReason[res.endReason]}</p>}
      </header>

      <div className="results-layout">
        <div className="podium">
          {podiumOrder.map((s, i) => {
            const height = s.place === 1 ? 220 : s.place === 2 ? 160 : 120;
            return (
              <motion.div
                key={s.playerId}
                className={`podium-col place-${s.place}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 80 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.3 + (3 - s.place) * 0.35, type: 'spring', stiffness: 160, damping: 18 }}
              >
                <Avatar avatar={byId.get(s.playerId)?.avatar ?? 'ghost'} size={s.place === 1 ? 110 : 84} ring={s.place === 1 ? 'gold' : undefined} />
                <strong>{nameOf(s.playerId)}</strong>
                <span className="podium-pts">{s.score.toLocaleString('de-DE')}</span>
                <div className="podium-block" style={{ height }}>
                  <span>{s.place}</span>
                </div>
                {i === 1 && s.place === 1 && !reduced && <div className="confetti" aria-hidden="true" />}
              </motion.div>
            );
          })}
        </div>

        <div className="results-side">
          <Panel title="Rangliste">
            <table className="ranking">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Spieler</th>
                  <th>{t.results.points}</th>
                  <th>{t.results.correct}</th>
                  <th>{t.results.longestStreak}</th>
                  <th>{t.results.firstCorrect}</th>
                </tr>
              </thead>
              <tbody>
                {res.standings.map((s) => (
                  <tr key={s.playerId} className={s.playerId === view.youId ? 'me' : ''}>
                    <td>{t.results.place(s.place)}</td>
                    <td>
                      <span className="cell-player">
                        <Avatar avatar={byId.get(s.playerId)?.avatar ?? 'ghost'} size={26} /> {nameOf(s.playerId)}
                      </span>
                    </td>
                    <td>{s.score.toLocaleString('de-DE')}</td>
                    <td>
                      {s.correct}/{s.opportunities}
                    </td>
                    <td>{s.longestStreak}</td>
                    <td>{s.firstCorrect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {me && (
            <Panel title="Deine Werte">
              <div className="stat-grid">
                <div><strong>{me.score.toLocaleString('de-DE')}</strong><span>{t.results.points}</span></div>
                <div><strong>{me.correct}/{me.opportunities}</strong><span>{t.results.correct}</span></div>
                <div><strong>{me.longestStreak}</strong><span>{t.results.longestStreak}</span></div>
                <div><strong>{me.firstCorrect}</strong><span>{t.results.firstCorrect}</span></div>
              </div>
            </Panel>
          )}

          {res.titles.length > 0 && (
            <Panel title="Titel">
              <ul className="titles">
                {res.titles.map((ti) => (
                  <li key={ti.id}>
                    <Icon name="sparkle" size={16} /> <strong>{t.results.titles[ti.id]!.name}</strong>: {nameOf(ti.playerId)}
                    <span className="muted"> – {t.results.titles[ti.id]!.rule}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="row gap wrap">
            {isHost ? (
              <>
                <Button variant="primary" size="lg" icon="refresh" onClick={() => void actions.rematch()}>
                  {t.results.rematch}
                </Button>
                <Button variant="secondary" size="lg" icon="users" onClick={() => void actions.toLobby()}>
                  {t.results.toLobby}
                </Button>
              </>
            ) : (
              <p className="muted">{t.results.hostDecides}</p>
            )}
            <Button variant="ghost" size="lg" icon="logout" onClick={() => void leaveRoom()}>
              {t.results.mainMenu}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WaitingScreen({ view }: { view: RoomView }) {
  return (
    <div className="screen narrow-screen center">
      <div className="spinner" />
      <h2>{t.lobby.waitingNext}</h2>
      <p className="muted">Raum {view.code}</p>
      <Button variant="ghost" icon="logout" onClick={() => void leaveRoom()}>
        {t.lobby.leave}
      </Button>
    </div>
  );
}
