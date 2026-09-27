import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ANSWER_SECONDS_OPTIONS,
  CLIPS_PER_PERSON_OPTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REACTION_EMOJIS,
  type RoomView,
  type StartBlocker
} from '@liked/protocol';
import { t } from '../i18n/de';
import { actions, leaveRoom } from '../lib/net';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { estimateMinutes, roundsInfo } from '../lib/game-info';
import { get, set, toast, useStore } from '../state/store';
import { Avatar, Button, Callout, Dialog, Icon, ModeBadge, Panel, Segmented, SimBadge } from '../components/ui';
import { DemoClip } from '../player/DemoClip';
import { TikTokEmbed } from '../player/TikTokEmbed';

type MediaState = 'untested' | 'failed' | 'ok';

export function useMediaState(view: RoomView): MediaState {
  const failed = useStore((s) => s.mediaFailed);
  const me = view.players.find((p) => p.id === view.youId);
  if (me?.mediaChecked) return 'ok';
  if (failed?.roomId === view.roomId) return 'failed';
  return 'untested';
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}: ${t.common.copied}`);
  } catch {
    toast(text);
  }
}

function openSettings(tab: 'clips' | 'tiktok' | 'audio') {
  set({ screen: 'settings', settingsTab: tab, returnTo: 'room' });
}

export function Lobby({ view }: { view: RoomView }) {
  const settings = useStore((s) => s.settings)!;
  const poolError = useStore((s) => s.poolError);
  const [mediaOpen, setMediaOpen] = useState(false);
  const me = view.players.find((p) => p.id === view.youId)!;
  const isHost = view.hostId === view.youId;
  const media = useMediaState(view);
  const name = (id: string) => (id === view.youId ? t.common.you : view.players.find((p) => p.id === id)?.name ?? '?');
  const active = view.players.filter((p) => !p.waiting);
  const joinLink = `${settings.serverUrl.replace(/\/$/, '')}/join/${view.code}`;
  const info = roundsInfo(active.length, view.settings.clipsPerPerson);
  const dur = estimateMinutes(info.rounds, view.settings.answerSeconds);
  const free = MAX_PLAYERS - view.players.length;
  const needMore = Math.max(0, MIN_PLAYERS - active.length);

  const toggleReady = async () => {
    const res = await actions.ready(!me.ready);
    if (!res.ok) toast(t.errors[res.error] ?? t.errors.network!, 'warn');
  };
  const start = async () => {
    const r = await actions.start();
    if (!r.ok) toast(t.errors[r.error] ?? '', 'warn');
  };

  // Genau eine Hauptaktion je Zustand.
  const primary: 'media' | 'ready' | 'start' | 'none' = media !== 'ok' ? 'media' : !me.ready ? 'ready' : isHost ? 'start' : 'none';

  return (
    <div className="screen lobby-screen">
      <header className="lobby-head">
        <div className="lobby-title">
          <h2>Lobby</h2>
          <ModeBadge mode={view.mode} solo={view.solo} />
        </div>
        {!view.solo && (
          <div className="room-code-block">
            <span className="label" id="code-label">
              {t.lobby.code}
            </span>
            <span className="room-code" aria-labelledby="code-label">
              {view.code}
            </span>
            <Button size="sm" variant="quiet" icon="copy" onClick={() => void copy(view.code, t.lobby.code)}>
              {t.lobby.copyCode}
            </Button>
            <Button size="sm" variant="quiet" icon="link" onClick={() => void copy(joinLink, t.lobby.copyLink)}>
              {t.lobby.copyLink}
            </Button>
          </div>
        )}
        <div className="lobby-head-actions">
          <Button size="sm" variant="quiet" icon="book" onClick={() => set({ screen: 'rules', returnTo: 'room' })}>
            {t.menu.rules}
          </Button>
          <Button size="sm" variant="quiet" icon="gear" onClick={() => openSettings('audio')}>
            {t.menu.settings}
          </Button>
          <Button size="sm" variant="quiet" icon="logout" onClick={() => void leaveRoom()}>
            {view.solo ? t.lobby.leaveSolo : t.lobby.leave}
          </Button>
        </div>
      </header>

      <div className="lobby-body">
        <section className="lobby-players" aria-labelledby="players-h">
          <div className="section-head">
            <h3 id="players-h">{t.lobby.players(view.players.length, MAX_PLAYERS)}</h3>
            {!view.solo && <span className="muted">{needMore > 0 ? t.lobby.blockers.too_few_players(active.length, MIN_PLAYERS) : t.lobby.capacity(MAX_PLAYERS)}</span>}
          </div>
          <div className={`player-grid n${Math.min(view.players.length + (view.solo || free === 0 ? 0 : 1), 9)}`}>
            <AnimatePresence initial={false}>
              {view.players.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  className={`player-card ${p.id === view.youId ? 'is-me' : ''} ${p.ready ? 'is-ready' : ''}`}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.2 }}
                >
                  <Avatar avatar={p.avatar} size={48} label={t.avatarName(p.avatar)} />
                  <div className="player-info">
                    <strong className="player-name">
                      {p.name}
                      {p.id === view.youId && <span className="muted"> ({t.common.you})</span>}
                    </strong>
                    <div className="tags">
                      {p.isHost && (
                        <span className="tag host">
                          <Icon name="crown" size={12} /> {t.lobby.host}
                        </span>
                      )}
                      {p.simulated && <SimBadge />}
                      <span className={`tag ${p.ready ? 'ok' : ''}`}>
                        <Icon name={p.ready ? 'check' : 'circle'} size={12} /> {p.ready ? t.lobby.ready : t.lobby.notReady}
                      </span>
                      {!view.solo && (
                        <span className={`tag ${p.poolStatus === 'ok' ? 'ok' : p.poolStatus === 'insufficient' ? 'bad' : ''}`}>
                          <Icon name={p.poolStatus === 'ok' ? 'check' : p.poolStatus === 'insufficient' ? 'alert' : 'circle'} size={12} />{' '}
                          {p.poolStatus === 'ok' ? t.lobby.poolOk : p.poolStatus === 'insufficient' ? t.lobby.poolInsufficient : t.lobby.poolMissing}
                        </span>
                      )}
                      {!p.connected && (
                        <span className="tag bad">
                          <Icon name="wifiOff" size={12} /> {t.lobby.disconnected}
                        </span>
                      )}
                      {p.waiting && <span className="tag">{t.lobby.waitingNext}</span>}
                    </div>
                  </div>
                  {isHost && p.id !== view.youId && !p.simulated && (
                    <button className="icon-btn kick-btn" onClick={() => void actions.kick(p.id)} aria-label={`${p.name} ${t.lobby.kick}`} title={t.lobby.kick}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {!view.solo && free > 0 && (
              <div className="invite-card">
                <strong>{needMore > 0 ? t.lobby.inviteNeed(needMore) : t.lobby.inviteMore(free)}</strong>
                <span className="muted">
                  {t.lobby.code}: <b className="mono">{view.code}</b>
                </span>
                <Button size="sm" variant="secondary" icon="link" onClick={() => void copy(joinLink, t.lobby.copyLink)}>
                  {t.lobby.copyLink}
                </Button>
              </div>
            )}
            {!view.solo && free === 0 && <div className="invite-card full">{t.lobby.full}</div>}
          </div>

          <div className="reactions-bar" role="group" aria-label={t.lobby.reactions}>
            {REACTION_EMOJIS.map((e) => (
              <button key={e} onClick={() => void actions.react(e)} aria-label={t.lobby.reactionLabel(t.reactionName(e))} title={t.reactionName(e)}>
                <span aria-hidden="true">{e}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="lobby-side">
          <Panel title="Partie">
            <div className="field">
              <span className="field-label">{t.lobby.clipsPerPerson}</span>
              <Segmented
                label={t.lobby.clipsPerPerson}
                value={view.settings.clipsPerPerson}
                disabled={!isHost}
                options={CLIPS_PER_PERSON_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                onChange={(v) => void actions.settings({ clipsPerPerson: v })}
              />
            </div>
            <div className="field">
              <span className="field-label">{t.lobby.answerTime}</span>
              <Segmented
                label={t.lobby.answerTime}
                value={view.settings.answerSeconds}
                disabled={!isHost}
                options={ANSWER_SECONDS_OPTIONS.map((n) => ({ value: n, label: t.common.seconds(n) }))}
                onChange={(v) => void actions.settings({ answerSeconds: v })}
              />
            </div>
            {!isHost && <p className="hint">{t.lobby.hostOnlySettings}</p>}
            <div className="round-info">
              <span>
                <Icon name="film" size={15} /> {t.lobby.roundsAt(info.rounds, info.players, info.basedOnMinimum)}
              </span>
              <span>
                <Icon name="clock" size={15} /> {t.lobby.duration(dur.min, dur.max)}
              </span>
            </div>
          </Panel>

          <Panel>
            <p className="consent">
              {view.solo ? t.lobby.consentSolo : view.mode === 'demo' ? t.lobby.consentDemo : t.lobby.consentTikTok(view.settings.clipsPerPerson)}
            </p>
            {view.mode === 'tiktok' && (
              <Button size="sm" variant="secondary" icon="film" onClick={() => openSettings('clips')}>
                {t.lobby.myClips}
              </Button>
            )}
            {poolError && view.mode === 'tiktok' && (
              <Callout
                tone="warn"
                title={t.lobby.poolError[poolError]}
                actions={
                  <Button size="sm" variant="secondary" onClick={() => openSettings('tiktok')}>
                    {t.tiktok.connect}
                  </Button>
                }
              />
            )}
          </Panel>

          {view.startBlockers.length > 0 && (
            <Panel title={t.lobby.blockersTitle} className="blockers-panel">
              <ul className="blockers" aria-live="polite">
                {view.startBlockers.map((b, i) => (
                  <BlockerRow key={i} b={b} view={view} name={name} onMedia={() => setMediaOpen(true)} onReady={() => void toggleReady()} joinLink={joinLink} />
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      <footer className="action-bar">
        <div className={`media-status media-${media}`}>
          <Icon name={media === 'ok' ? 'check' : media === 'failed' ? 'alert' : 'circle'} size={16} />
          <span>{t.lobby.media[media]}</span>
          <Button size="sm" variant={primary === 'media' ? 'primary' : 'quiet'} icon="speaker" onClick={() => setMediaOpen(true)}>
            {media === 'untested' ? t.lobby.mediaCheck : t.lobby.mediaRetest}
          </Button>
        </div>
        <div className="action-bar-right">
          {!me.ready && media !== 'ok' && <span className="action-hint">{t.lobby.readyNeedsMedia}</span>}
          {!me.ready && media === 'ok' && me.poolStatus !== 'ok' && <span className="action-hint">{t.lobby.readyNeedsPool}</span>}
          <Button
            variant={primary === 'ready' ? 'primary' : 'secondary'}
            icon={me.ready ? 'x' : 'check'}
            disabled={!me.ready && (me.poolStatus !== 'ok' || media !== 'ok')}
            onClick={() => void toggleReady()}
          >
            {me.ready ? t.lobby.unready : t.lobby.makeReady}
          </Button>
          {isHost ? (
            <Button variant={primary === 'start' ? 'primary' : 'secondary'} size="lg" icon="play" disabled={view.startBlockers.length > 0} onClick={() => void start()}>
              {t.lobby.start}
            </Button>
          ) : (
            me.ready && <span className="action-hint">{t.lobby.waitingForHost}</span>
          )}
        </div>
      </footer>

      {mediaOpen && <MediaCheck view={view} onClose={() => setMediaOpen(false)} />}
    </div>
  );
}

function BlockerRow({
  b,
  view,
  name,
  onMedia,
  onReady,
  joinLink
}: {
  b: StartBlocker;
  view: RoomView;
  name: (id: string) => string;
  onMedia(): void;
  onReady(): void;
  joinLink: string;
}) {
  const names = 'playerIds' in b ? b.playerIds.map(name).join(', ') : '';
  const mine = 'playerIds' in b && b.playerIds.includes(view.youId);
  const isHost = view.hostId === view.youId;
  let text = '';
  let action: React.ReactNode = null;
  switch (b.kind) {
    case 'too_few_players':
      text = t.lobby.blockers.too_few_players(b.have, b.need);
      if (!view.solo)
        action = (
          <Button size="sm" variant="quiet" icon="link" onClick={() => void copy(joinLink, t.lobby.copyLink)}>
            {t.lobby.blockerAction.invite}
          </Button>
        );
      break;
    case 'not_ready':
      text = t.lobby.blockers.not_ready(names);
      if (mine && view.players.find((p) => p.id === view.youId)?.mediaChecked)
        action = (
          <Button size="sm" variant="quiet" icon="check" onClick={onReady}>
            {t.lobby.blockerAction.ready}
          </Button>
        );
      break;
    case 'pool_missing':
      text = t.lobby.blockers.pool_missing(names);
      if (mine)
        action = (
          <Button size="sm" variant="quiet" icon="film" onClick={() => openSettings('clips')}>
            {t.lobby.blockerAction.clips}
          </Button>
        );
      break;
    case 'pool_insufficient':
      text = t.lobby.blockers.pool_insufficient(names, b.need);
      action = mine ? (
        <Button size="sm" variant="quiet" icon="film" onClick={() => openSettings('clips')}>
          {t.lobby.blockerAction.clips}
        </Button>
      ) : isHost && view.settings.clipsPerPerson > 5 ? (
        <Button size="sm" variant="quiet" onClick={() => void actions.settings({ clipsPerPerson: 5 })}>
          {t.lobby.blockerAction.fewerClips}
        </Button>
      ) : null;
      break;
    case 'media_unchecked':
      text = t.lobby.blockers.media_unchecked(names);
      if (mine)
        action = (
          <Button size="sm" variant="quiet" icon="speaker" onClick={onMedia}>
            {t.lobby.blockerAction.media}
          </Button>
        );
      break;
    case 'disconnected':
      text = t.lobby.blockers.disconnected(names);
      break;
  }
  return (
    <li>
      <Icon name="circle" size={14} />
      <span>{text}</span>
      {action}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Medientest mit Fehlerbehebung                                        */
/* ------------------------------------------------------------------ */

type Step = 'test' | 'problem' | 'tips';

function MediaCheck({ view, onClose }: { view: RoomView; onClose(): void }) {
  const failed = useStore((s) => s.mediaFailed);
  const [step, setStep] = useState<Step>(failed?.roomId === view.roomId ? 'tips' : 'test');
  const [problem, setProblem] = useState<'sound' | 'picture' | 'both'>(failed?.roomId === view.roomId ? failed.problem : 'both');
  const [attempt, setAttempt] = useState(1);
  const [sample, setSample] = useState<string | null | undefined>(view.mode === 'tiktok' ? undefined : null);
  useEffect(() => {
    if (view.mode === 'tiktok') void api.tiktok.sample(1).then((s) => setSample(s[0]?.id ?? null));
  }, [view.mode]);
  const start = useMemo(() => Date.now() + 400, [attempt]);

  const what = view.mode !== 'tiktok' ? t.mediaTest.whatDemo : sample ? t.mediaTest.whatTiktok : t.mediaTest.whatTiktokNoData;

  const confirm = async () => {
    sound.unlock();
    await actions.mediaCheck(true);
    set({ mediaFailed: null });
    onClose();
  };
  const markFailed = async (p: 'sound' | 'picture' | 'both') => {
    setProblem(p);
    set({ mediaFailed: { roomId: view.roomId, problem: p } });
    // Ein zuvor bestätigter Test gilt nicht mehr – Bereitschaft wird serverseitig zurückgenommen.
    if (get().view?.players.find((x) => x.id === view.youId)?.mediaChecked) await actions.mediaCheck(false);
    setStep('tips');
  };
  const retest = () => {
    setAttempt((a) => a + 1);
    setStep('test');
  };

  return (
    <Dialog
      title={t.mediaTest.title}
      onClose={onClose}
      wide
      focusKey={step}
      footer={
        step === 'test' ? (
          <>
            <Button variant="quiet" icon="speaker" onClick={() => {
              sound.unlock();
              sound.testTone();
            }}>
              {t.mediaTest.playTone}
            </Button>
            <span className="spacer" />
            <Button variant="secondary" icon="x" onClick={() => setStep('problem')}>
              {t.mediaTest.no}
            </Button>
            <Button variant="primary" icon="check" data-autofocus onClick={() => void confirm()}>
              {t.mediaTest.yes}
            </Button>
          </>
        ) : step === 'tips' ? (
          <>
            <Button variant="quiet" icon="arrowLeft" onClick={onClose}>
              {t.mediaTest.backToLobby}
            </Button>
            <span className="spacer" />
            <Button variant="primary" icon="refresh" data-autofocus onClick={retest}>
              {t.mediaTest.retest}
            </Button>
          </>
        ) : null
      }
    >
      {step === 'test' && (
        <div className="media-test">
          <div className="media-stage">
            <div className="clip-frame small" key={attempt}>
              {view.mode === 'tiktok' && sample ? (
                <TikTokEmbed
                  clip={{ source: 'tiktok', videoId: sample }}
                  loadKey={`mt${attempt}`}
                  startAtLocal={null}
                  stopAtLocal={null}
                  startMuted={false}
                  onReady={() => undefined}
                  onLoadFailed={() => undefined}
                  onPlayback={() => undefined}
                />
              ) : sample === undefined ? (
                <div className="clip-overlay">
                  <div className="spinner" />
                </div>
              ) : (
                <DemoClip
                  clip={{ source: 'demo', videoId: 'demo-mediatest' }}
                  loadKey={`mt${attempt}`}
                  startAtLocal={start}
                  stopAtLocal={start + 8000}
                  startMuted={false}
                  onReady={() => undefined}
                  onLoadFailed={() => undefined}
                  onPlayback={() => undefined}
                />
              )}
            </div>
          </div>
          <div className="media-text">
            <p className="hint">{what}</p>
            {view.mode === 'tiktok' && sample && <p className="hint">{t.round.unmuteHint}</p>}
            <p className="question">{t.mediaTest.question}</p>
          </div>
        </div>
      )}
      {step === 'problem' && (
        <div className="media-problem">
          <p className="question">{t.mediaTest.whichProblem}</p>
          <div className="choice-list" role="group" aria-label={t.mediaTest.whichProblem}>
            {(['sound', 'picture', 'both'] as const).map((p, i) => (
              <Button key={p} variant="secondary" icon={p === 'sound' ? 'mute' : p === 'picture' ? 'eyeOff' : 'alert'} onClick={() => void markFailed(p)} {...(i === 0 ? { 'data-autofocus': true } : {})}>
                {t.mediaTest.problems[p]}
              </Button>
            ))}
          </div>
          <Button variant="quiet" icon="arrowLeft" onClick={() => setStep('test')}>
            {t.common.back}
          </Button>
        </div>
      )}
      {step === 'tips' && (
        <div className="media-tips">
          <Callout tone="warn" title={`${t.lobby.media.failed}: ${t.mediaTest.problems[problem]}`}>
            <ul>
              {t.mediaTest.tips[problem]!.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </Callout>
          <p className="hint">{t.mediaTest.failedNote}</p>
          {problem !== 'picture' && (
            <Button size="sm" variant="quiet" icon="gear" onClick={() => openSettings('audio')}>
              {t.settings.tabs.audio}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
