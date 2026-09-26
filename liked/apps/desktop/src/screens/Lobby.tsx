import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ANSWER_SECONDS_OPTIONS, CLIPS_PER_PERSON_OPTIONS, MAX_PLAYERS, REACTION_EMOJIS, type RoomView, type StartBlocker } from '@liked/protocol';
import { t } from '../i18n/de';
import { actions, leaveRoom } from '../lib/net';
import { sound } from '../lib/sound';
import { set, toast, useStore } from '../state/store';
import { Avatar, Button, DemoBadge, Icon, Panel, Segmented } from '../components/ui';
import { DemoClip } from '../player/DemoClip';

function blockerText(b: StartBlocker, name: (id: string) => string): string {
  const names = 'playerIds' in b ? b.playerIds.map(name).join(', ') : '';
  switch (b.kind) {
    case 'too_few_players':
      return t.lobby.blockers.too_few_players(b.have, b.need);
    case 'not_ready':
      return t.lobby.blockers.not_ready(names);
    case 'pool_missing':
      return t.lobby.blockers.pool_missing(names);
    case 'pool_insufficient':
      return t.lobby.blockers.pool_insufficient(names, b.need);
    case 'media_unchecked':
      return t.lobby.blockers.media_unchecked(names);
    case 'disconnected':
      return t.lobby.blockers.disconnected(names);
  }
}

export function Lobby({ view }: { view: RoomView }) {
  const settings = useStore((s) => s.settings)!;
  const poolError = useStore((s) => s.poolError);
  const [copied, setCopied] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const me = view.players.find((p) => p.id === view.youId)!;
  const isHost = view.hostId === view.youId;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const active = view.players.filter((p) => !p.waiting);
  const slots = useMemo(() => Array.from({ length: MAX_PLAYERS }, (_, i) => view.players[i] ?? null), [view.players]);
  const joinLink = `${settings.serverUrl.replace(/\/$/, '')}/join/${view.code}`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast(text);
    }
  };

  const toggleReady = async () => {
    const res = await actions.ready(!me.ready);
    if (!res.ok) toast(t.errors[res.error] ?? t.errors.network!, 'warn');
  };

  return (
    <div className="screen lobby-screen">
      <header className="lobby-head">
        <div className="room-code-block">
          <span className="label">{t.lobby.code}</span>
          <button className="room-code" onClick={() => void copy(view.code)} aria-label={`${t.lobby.code} ${view.code} – ${t.common.copy}`}>
            {view.code.split('').map((c, i) => (
              <span key={i}>{c}</span>
            ))}
            <Icon name={copied ? 'check' : 'copy'} size={22} />
          </button>
          <Button size="sm" variant="ghost" icon="link" onClick={() => void copy(joinLink)}>
            {t.lobby.copyLink}
          </Button>
        </div>
        {view.mode === 'demo' && <DemoBadge text={t.lobby.demoBadge} />}
        <div className="lobby-head-actions">
          <Button variant="ghost" icon="gear" onClick={() => set({ screen: 'settings', settingsTab: 'audio' })}>
            {t.menu.settings}
          </Button>
          <Button variant="ghost" icon="logout" onClick={() => void leaveRoom()}>
            {t.lobby.leave}
          </Button>
        </div>
      </header>

      <div className="lobby-body">
        <section className="slots" aria-label={t.lobby.players(active.length, MAX_PLAYERS)}>
          <h3 className="section-title">{t.lobby.players(view.players.length, MAX_PLAYERS)}</h3>
          <div className="slot-grid">
            <AnimatePresence initial={false}>
              {slots.map((p, i) =>
                p ? (
                  <motion.div
                    key={p.id}
                    layout
                    className={`slot filled ${p.ready ? 'is-ready' : ''} ${p.id === view.youId ? 'is-me' : ''}`}
                    initial={{ opacity: 0, scale: 0.85, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  >
                    <div className="slot-avatar">
                      <Avatar avatar={p.avatar} size={64} ring={p.ready ? 'success' : undefined} />
                      {p.isHost && (
                        <span className="host-badge" title={t.lobby.host}>
                          <Icon name="crown" size={16} />
                        </span>
                      )}
                    </div>
                    <strong className="slot-name">
                      {p.name}
                      {p.id === view.youId ? ` (${t.common.you})` : ''}
                    </strong>
                    <div className="slot-tags">
                      <span className={`tag ${p.ready ? 'ok' : ''}`}>
                        <Icon name={p.ready ? 'check' : 'x'} size={12} /> {p.ready ? t.lobby.ready : t.lobby.notReady}
                      </span>
                      <span className={`tag ${p.poolStatus === 'ok' ? 'ok' : p.poolStatus === 'insufficient' ? 'bad' : ''}`} title={t.lobby.clipsPerPerson}>
                        <Icon name="heart" size={12} />{' '}
                        {p.poolStatus === 'ok' ? t.lobby.poolOk : p.poolStatus === 'insufficient' ? t.lobby.poolInsufficient : t.lobby.poolMissing}
                      </span>
                      {!p.connected && (
                        <span className="tag bad">
                          <Icon name="wifiOff" size={12} /> {t.lobby.disconnected}
                        </span>
                      )}
                      {p.waiting && <span className="tag">{t.lobby.waitingNext}</span>}
                    </div>
                    {isHost && p.id !== view.youId && (
                      <button className="kick-btn" onClick={() => void actions.kick(p.id)} aria-label={`${p.name} ${t.lobby.kick}`}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <div key={`empty-${i}`} className="slot empty">
                    <span className="slot-empty-ring" />
                    <span className="muted">{t.lobby.waitingSlot}</span>
                  </div>
                )
              )}
            </AnimatePresence>
          </div>
          <div className="reactions-bar" aria-label={t.lobby.reactions}>
            {REACTION_EMOJIS.map((e) => (
              <button key={e} onClick={() => void actions.react(e)} aria-label={e}>
                {e}
              </button>
            ))}
          </div>
        </section>

        <aside className="lobby-side">
          <Panel title={t.menu.settings}>
            <div className="field">
              <span>{t.lobby.clipsPerPerson}</span>
              <Segmented
                label={t.lobby.clipsPerPerson}
                value={view.settings.clipsPerPerson}
                disabled={!isHost}
                options={CLIPS_PER_PERSON_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => void actions.settings({ clipsPerPerson: v })}
              />
            </div>
            <div className="field">
              <span>{t.lobby.answerTime}</span>
              <Segmented
                label={t.lobby.answerTime}
                value={view.settings.answerSeconds}
                disabled={!isHost}
                options={ANSWER_SECONDS_OPTIONS.map((n) => ({ value: n, label: t.common.seconds(n) }))}
                onChange={(v) => void actions.settings({ answerSeconds: v })}
              />
            </div>
            <p className="muted">{t.lobby.rounds(Math.max(active.length, 3) * view.settings.clipsPerPerson)}</p>
          </Panel>

          <Panel>
            <p className="consent">{t.lobby.consent(view.settings.clipsPerPerson)}</p>
            {poolError && view.mode === 'tiktok' && (
              <p className="error-text">
                {t.lobby.poolError[poolError]}{' '}
                <Button size="sm" variant="cyan" onClick={() => set({ screen: 'settings', settingsTab: 'tiktok' })}>
                  {t.tiktok.connect}
                </Button>
              </p>
            )}
            <div className="row gap wrap">
              <Button variant={me.mediaChecked ? 'ghost' : 'secondary'} icon={me.mediaChecked ? 'check' : 'speaker'} onClick={() => setMediaOpen(true)}>
                {me.mediaChecked ? t.lobby.mediaChecked : t.lobby.mediaCheck}
              </Button>
              <Button variant={me.ready ? 'ghost' : 'cyan'} size="lg" icon={me.ready ? 'x' : 'check'} disabled={!me.ready && (me.poolStatus !== 'ok' || !me.mediaChecked)} onClick={() => void toggleReady()}>
                {me.ready ? t.lobby.unready : t.lobby.makeReady}
              </Button>
            </div>
          </Panel>

          {view.startBlockers.length > 0 && (
            <ul className="blockers" aria-live="polite">
              {view.startBlockers.map((b, i) => (
                <li key={i}>
                  <Icon name="alert" size={14} /> {blockerText(b, name)}
                </li>
              ))}
            </ul>
          )}
          {isHost && (
            <Button
              variant="primary"
              size="xl"
              icon="play"
              disabled={view.startBlockers.length > 0}
              onClick={async () => {
                const r = await actions.start();
                if (!r.ok) toast(t.errors[r.error] ?? '', 'warn');
              }}
            >
              {t.lobby.start}
            </Button>
          )}
        </aside>
      </div>

      <AnimatePresence>{mediaOpen && <MediaCheck onClose={() => setMediaOpen(false)} />}</AnimatePresence>
    </div>
  );
}

/** Ton- und Videotest vor der ersten Wertungsrunde; schaltet Audio per Nutzerklick frei. */
function MediaCheck({ onClose }: { onClose(): void }) {
  const [start] = useState(() => Date.now() + 300);
  const answer = async (ok: boolean) => {
    sound.unlock();
    await actions.mediaCheck(ok);
    onClose();
  };
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" role="dialog" aria-modal="true" aria-labelledby="mc-title" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}>
        <h3 id="mc-title">{t.lobby.mediaCheckTitle}</h3>
        <p className="hint">{t.lobby.mediaCheckHint}</p>
        <div className="media-check-stage">
          <div className="clip-frame small">
            <DemoClip
              clip={{ source: 'demo', videoId: 'demo-mediatest' }}
              loadKey="mediatest"
              startAtLocal={start}
              stopAtLocal={start + 6000}
              startMuted={false}
              onReady={() => undefined}
              onLoadFailed={() => undefined}
              onPlayback={() => undefined}
            />
          </div>
        </div>
        <div className="row gap">
          <Button variant="ghost" icon="speaker" onClick={() => {
            sound.unlock();
            sound.testTone();
          }}>
            Testton
          </Button>
          <Button variant="danger" onClick={() => void answer(false)}>
            {t.lobby.mediaNo}
          </Button>
          <Button variant="primary" icon="check" onClick={() => void answer(true)} autoFocus>
            {t.lobby.mediaYes}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
