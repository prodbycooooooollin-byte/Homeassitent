import { useEffect, useState } from 'react';
import type { ClipRef } from '@liked/protocol';
import { CLIPS_PER_PERSON_OPTIONS } from '@liked/protocol';
import type { ConnectionStatus } from '@liked/tiktok-connectors';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { maybeSubmitPool, startSoloDemo } from '../lib/net';
import { set, useStore } from '../state/store';
import { Button, Callout, Dialog, Disclosure, formatDate, Icon, Panel, Toggle } from '../components/ui';
import { TikTokEmbed } from '../player/TikTokEmbed';
import type { ClipListEntry, TikTokOverview } from '../shared/ipc-types';

type Tone = 'ok' | 'busy' | 'bad' | 'idle';

function statusTone(s: ConnectionStatus): Tone {
  if (s.kind === 'ready') return 'ok';
  if (s.kind === 'syncing' || s.kind === 'authorizing' || s.kind === 'connected_no_likes') return 'busy';
  if (s.kind === 'error' || s.kind === 'expired' || s.kind === 'unsupported') return 'bad';
  return 'idle';
}

/** Kurzbezeichnung des Zustands – unterscheidet „wird vorbereitet“ von „läuft“. */
export function statusLabel(s: ConnectionStatus): string {
  if (s.kind === 'syncing' && (s.stage === 'requesting' || s.stage === 'preparing')) return t.tiktok.syncingPrepare;
  return t.tiktok.states[s.kind] ?? s.kind;
}

const TONE_ICON: Record<Tone, string> = { ok: 'check', busy: 'clock', bad: 'alert', idle: 'circle' };

/** Kompakte Statuszeile für den Startbildschirm. */
export function TikTokChip() {
  const o = useStore((s) => s.tiktok);
  if (!o) return null;
  const tone = statusTone(o.status);
  return (
    <button className={`tiktok-chip tone-${tone}`} onClick={() => set({ screen: 'settings', settingsTab: 'tiktok', returnTo: 'menu' })}>
      <span className="tiktok-chip-icon">
        <Icon name="heart" size={18} />
      </span>
      <span className="tiktok-chip-main">
        <small>{t.tiktok.title}</small>
        <strong>
          <Icon name={TONE_ICON[tone]} size={14} /> {statusLabel(o.status)}
        </strong>
        <small>{o.index ? t.tiktok.clips(o.index.count) : t.tiktok.noSyncYet}</small>
      </span>
      <Icon name="arrowRight" size={16} className="chip-arrow" />
    </button>
  );
}

const apply = (o: TikTokOverview) => set({ tiktok: o });

export function TikTokPanel() {
  const o = useStore((s) => s.tiktok);
  const settings = useStore((s) => s.settings)!;
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const run = async (fn: () => Promise<TikTokOverview>) => {
    setBusy(true);
    try {
      apply(await fn());
      void maybeSubmitPool(undefined, true);
    } finally {
      setBusy(false);
    }
  };
  if (!o) return null;
  const s = o.status;
  const tone = statusTone(s);
  const account = 'account' in s && s.account ? s.account : null;
  const isExperimental = account?.adapter === 'web-experimental' || (s.kind === 'authorizing' && s.adapter === 'web-experimental');
  const connectOfficial = () => void run(() => api.tiktok.connect('portability'));

  return (
    <div className="stack">
      <Panel className={`tiktok-status tone-${tone}`}>
        <div className="status-head">
          <span className={`status-icon tone-${tone}`}>
            <Icon name={TONE_ICON[tone]} size={22} />
          </span>
          <div>
            <small className="eyebrow">{t.tiktok.title}</small>
            <h3>{statusLabel(s)}</h3>
            {account && (
              <p className="muted">
                {account.displayName} · {account.adapter === 'portability' ? t.tiktok.official : t.tiktok.experimental}
              </p>
            )}
          </div>
        </div>

        {s.kind === 'disconnected' && <p>{t.tiktok.browserHint}</p>}

        {s.kind === 'authorizing' && (
          <div className="status-detail">
            <div className="progress indeterminate" role="progressbar" aria-label={t.tiktok.states.authorizing} />
            <p>{t.tiktok.authorizingHint}</p>
          </div>
        )}

        {s.kind === 'syncing' && (
          <div className="status-detail" role="status">
            <div className="progress indeterminate" role="progressbar" aria-label={statusLabel(s)} />
            <p>
              <strong>{t.tiktok.stages[s.stage]}</strong>
              {s.found !== undefined ? ` · ${t.tiktok.experimentalFound(s.found)}` : ''}
            </p>
            {s.stage === 'preparing' && <p className="hint">{t.tiktok.preparingHint}</p>}
            {s.nextCheckAt && <p className="hint">{t.tiktok.nextCheck(formatDate(s.nextCheckAt))}</p>}
            {s.stage === 'collecting' && <p className="hint">{t.tiktok.experimentalCollect}</p>}
          </div>
        )}

        {s.kind === 'ready' && <p className="big-count">{t.tiktok.clips(s.clipCount)}</p>}

        {s.kind === 'error' && (
          <Callout tone="error" title={t.tiktok.errorCause}>
            <p>{s.message}</p>
            {o.index && <p>{t.tiktok.keptOldData}</p>}
          </Callout>
        )}
        {s.kind === 'expired' && (
          <Callout tone="warn" title={t.tiktok.expiredHint}>
            {o.index && <p>{t.tiktok.keptOldData}</p>}
          </Callout>
        )}
        {s.kind === 'unsupported' && (
          <Callout tone="warn">
            <p>{s.detail ?? t.tiktok.unsupported[s.reason]}</p>
            {s.detail && t.tiktok.unsupported[s.reason] && <p>{t.tiktok.unsupported[s.reason]}</p>}
          </Callout>
        )}

        <p className="muted small">{o.index ? t.tiktok.lastSync(formatDate(o.index.syncedAt)) : t.tiktok.noSyncYet}</p>

        <div className="button-row">
          {s.kind === 'disconnected' && (
            <Button variant="primary" icon="heart" disabled={busy} onClick={connectOfficial}>
              {t.tiktok.connect}
            </Button>
          )}
          {s.kind === 'unsupported' && (
            <Button variant="secondary" icon="refresh" disabled={busy} onClick={connectOfficial}>
              {t.common.retry}
            </Button>
          )}
          {s.kind === 'error' && !account && (
            <Button variant="primary" icon="refresh" disabled={busy} onClick={connectOfficial}>
              {t.common.retry}
            </Button>
          )}
          {s.kind === 'expired' && (
            <Button variant="primary" icon="refresh" disabled={busy} onClick={() => void run(() => api.tiktok.connect(isExperimental ? 'web-experimental' : 'portability'))}>
              {t.tiktok.reconnect}
            </Button>
          )}
          {(s.kind === 'connected_no_likes' || s.kind === 'ready' || (s.kind === 'error' && account)) && (
            <Button variant={s.kind === 'ready' ? 'secondary' : 'primary'} icon="refresh" disabled={busy} onClick={() => void run(() => api.tiktok.sync())}>
              {s.kind === 'ready' ? t.tiktok.resync : s.kind === 'error' ? t.common.retry : t.tiktok.sync}
            </Button>
          )}
          {s.kind === 'authorizing' && s.adapter === 'portability' && (
            <Button variant="secondary" icon="link" disabled={busy} onClick={connectOfficial}>
              {t.tiktok.reopenBrowser}
            </Button>
          )}
          {s.kind === 'syncing' && s.stage === 'collecting' && (
            <Button variant="primary" icon="check" disabled={busy || !s.found} onClick={() => void run(() => api.tiktok.commitCollected())}>
              {t.tiktok.experimentalCommit}
            </Button>
          )}
          {(s.kind === 'syncing' || s.kind === 'authorizing') && (
            <Button variant="quiet" icon="x" disabled={busy} onClick={() => void run(() => api.tiktok.cancel())}>
              {s.kind === 'authorizing' ? t.tiktok.cancelLogin : t.tiktok.cancelSync}
            </Button>
          )}
          {(s.kind === 'error' || s.kind === 'unsupported') && (
            <Button variant="quiet" disabled={busy} onClick={() => void run(() => api.tiktok.dismissError())}>
              {t.common.dismiss}
            </Button>
          )}
          {(account || o.index) && s.kind !== 'authorizing' && s.kind !== 'syncing' && (
            <Button variant="quiet" icon="logout" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
              {t.tiktok.disconnect}
            </Button>
          )}
        </div>
        {o.officialConfigured === false && s.kind !== 'unsupported' && <p className="hint">{t.tiktok.unsupported.adapter_unavailable}</p>}
        {o.officialConfigured === null && <p className="hint">{t.tiktok.serverUnknown}</p>}
      </Panel>

      {o.index && (
        <Panel title={t.clips.title} actions={<Button size="sm" variant="quiet" iconRight="arrowRight" onClick={() => set({ settingsTab: 'clips' })}>{t.lobby.myClips}</Button>}>
          <p className="hint">{t.clips.intro}</p>
        </Panel>
      )}

      <Disclosure summary={t.common.advanced}>
        <div className="stack">
          <h4>{t.tiktok.experimental}</h4>
          <p className="hint">{t.tiktok.experimentalWarn}</p>
          <Toggle
            checked={settings.experimentalWebAdapter}
            label={t.settings.experimentalToggle}
            onChange={async (v) => {
              set({ settings: await api.settings.set({ experimentalWebAdapter: v }) });
              apply(await api.tiktok.overview());
            }}
          />
          {settings.experimentalWebAdapter && (s.kind === 'disconnected' || s.kind === 'unsupported') && (
            <div>
              <Button variant="secondary" icon="eye" disabled={busy} onClick={() => void run(() => api.tiktok.connect('web-experimental'))}>
                {t.tiktok.experimental}
              </Button>
            </div>
          )}
          {o.index && <ProofPanel />}
        </div>
      </Disclosure>

      {confirmDisconnect && (
        <Dialog
          title={t.tiktok.disconnect}
          onClose={() => setConfirmDisconnect(false)}
          footer={
            <>
              <span className="spacer" />
              <Button variant="quiet" data-autofocus onClick={() => setConfirmDisconnect(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                icon="logout"
                onClick={() => {
                  setConfirmDisconnect(false);
                  void run(() => api.tiktok.disconnect());
                }}
              >
                {t.tiktok.disconnect}
              </Button>
            </>
          }
        >
          <p>{t.tiktok.disconnectConfirm}</p>
        </Dialog>
      )}
    </div>
  );
}

/** Integrationsnachweis: importierte IDs anzeigen und im vorgesehenen Player abspielen. */
function ProofPanel() {
  const [sample, setSample] = useState<{ id: string; t?: number }[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    void api.tiktok.sample(10).then(setSample);
  }, []);
  return (
    <div className="stack">
      <h4>{t.tiktok.proofTitle}</h4>
      <p className="hint">{t.tiktok.proofHint}</p>
      <div className="proof-grid">
        <ol className="id-list">
          {sample.map((l) => (
            <li key={l.id}>
              <code>{l.id}</code>
              <span className="muted">{l.t ? formatDate(l.t) : '–'}</span>
              <Button size="sm" variant="quiet" icon="play" onClick={() => setPlaying(l.id)}>
                {t.tiktok.proofPlay}
              </Button>
            </li>
          ))}
        </ol>
        {playing && (
          <div className="proof-player">
            <TikTokEmbedStandalone videoId={playing} />
          </div>
        )}
      </div>
    </div>
  );
}

function TikTokEmbedStandalone({ videoId }: { videoId: string }) {
  const clip: ClipRef = { source: 'tiktok', videoId };
  const [start, setStart] = useState<number | null>(null);
  return (
    <div className="clip-frame">
      <TikTokEmbed
        clip={clip}
        loadKey={videoId}
        startAtLocal={start}
        stopAtLocal={null}
        startMuted={false}
        onReady={() => setStart(Date.now() + 100)}
        onLoadFailed={() => undefined}
        onPlayback={() => undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meine Clips                                                          */
/* ------------------------------------------------------------------ */

const PAGE = 60;

export function ClipsPanel() {
  const o = useStore((s) => s.tiktok);
  const view = useStore((s) => s.view);
  const [list, setList] = useState<ClipListEntry[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const hasIndex = !!o?.index && o.index.count > 0;
  useEffect(() => {
    if (hasIndex) void api.tiktok.listClips().then(setList);
    else setList([]);
  }, [hasIndex, o?.index?.syncedAt]);

  if (!o) return null;
  if (!hasIndex) {
    return (
      <Panel className="empty-state">
        <Icon name="film" size={36} />
        <h3>{t.clips.emptyTitle}</h3>
        <p className="muted">{t.clips.emptyText}</p>
        <div className="button-row center">
          <Button variant="primary" icon="heart" onClick={() => set({ settingsTab: 'tiktok' })}>
            {t.clips.emptyAction}
          </Button>
          {!view && (
            <Button variant="secondary" icon="play" onClick={() => startSoloDemo()}>
              {t.clips.soloAction}
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  const excluded = list?.filter((c) => c.excluded).length ?? 0;
  const available = (list?.length ?? o.index!.count) - excluded;
  const need = view && view.mode === 'tiktok' ? view.settings.clipsPerPerson : null;
  const minNeed = need ?? Math.min(...CLIPS_PER_PERSON_OPTIONS);
  const toggle = async (c: ClipListEntry) => {
    await api.tiktok.setExcluded(c.id, !c.excluded);
    setList((l) => l?.map((x) => (x.id === c.id ? { ...x, excluded: !x.excluded } : x)) ?? null);
    void maybeSubmitPool(undefined, true);
  };

  return (
    <div className="stack">
      <Panel title={t.clips.title}>
        <p className="hint">{t.clips.intro}</p>
        <dl className="stat-row">
          <div>
            <dt>{t.clips.available}</dt>
            <dd>{list ? available : '…'}</dd>
          </div>
          <div>
            <dt>{t.clips.excluded}</dt>
            <dd>{list ? excluded : '…'}</dd>
          </div>
          <div>
            <dt>{t.clips.needed}</dt>
            <dd>{need ?? t.clips.neededValue(minNeed)}</dd>
          </div>
        </dl>
        {list && available < minNeed && (
          <Callout tone="warn" title={t.clips.notEnough(available, minNeed)} />
        )}
        {view?.mode === 'demo' && <p className="hint">{t.clips.demoNote}</p>}
      </Panel>

      <Panel>
        <div className="proof-grid">
          <ul className="id-list clip-list">
            {(list ?? []).slice(0, limit).map((c) => (
              <li key={c.id} className={c.excluded ? 'excluded' : ''}>
                <code>{c.id}</code>
                <span className={`clip-state ${c.excluded ? 'off' : 'on'}`}>
                  <Icon name={c.excluded ? 'eyeOff' : 'check'} size={13} /> {c.excluded ? t.clips.stateExcluded : t.clips.stateIncluded}
                </span>
                <span className="muted">{c.t ? formatDate(c.t) : ''}</span>
                <Button size="sm" variant="quiet" icon="play" onClick={() => setPreview(c.id)} aria-label={`${t.clips.view}: ${c.id}`}>
                  {t.clips.view}
                </Button>
                <Button size="sm" variant={c.excluded ? 'secondary' : 'quiet'} onClick={() => void toggle(c)}>
                  {c.excluded ? t.clips.include : t.clips.exclude}
                </Button>
              </li>
            ))}
          </ul>
          {preview && (
            <div className="proof-player">
              <TikTokEmbedStandalone key={preview} videoId={preview} />
            </div>
          )}
        </div>
        {list && (
          <div className="button-row">
            <span className="muted small">{t.clips.shown(Math.min(limit, list.length), list.length)}</span>
            {limit < list.length && (
              <Button size="sm" variant="quiet" onClick={() => setLimit(limit + PAGE)}>
                +{PAGE}
              </Button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
