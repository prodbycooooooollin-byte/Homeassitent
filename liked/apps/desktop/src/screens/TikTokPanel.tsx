import { useEffect, useState } from 'react';
import type { ClipRef } from '@liked/protocol';
import type { ConnectionStatus } from '@liked/tiktok-connectors';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { maybeSubmitPool } from '../lib/net';
import { set, useStore } from '../state/store';
import { Button, formatDate, Icon, Panel, Toggle } from '../components/ui';
import { TikTokEmbed } from '../player/TikTokEmbed';
import type { ClipListEntry, TikTokOverview } from '../shared/ipc-types';

function statusTone(s: ConnectionStatus): 'ok' | 'warn' | 'bad' | 'idle' {
  if (s.kind === 'ready') return 'ok';
  if (s.kind === 'syncing' || s.kind === 'authorizing' || s.kind === 'connected_no_likes') return 'warn';
  if (s.kind === 'error' || s.kind === 'expired' || s.kind === 'unsupported') return 'bad';
  return 'idle';
}

export function TikTokChip() {
  const o = useStore((s) => s.tiktok);
  if (!o) return null;
  const tone = statusTone(o.status);
  return (
    <button className={`tiktok-chip tone-${tone}`} onClick={() => set({ screen: 'settings', settingsTab: 'tiktok' })}>
      <Icon name="heart" size={18} />
      <span className="tiktok-chip-main">
        <strong>{t.menu.tiktok}: {t.tiktok.states[o.status.kind]}</strong>
        <small>{o.index ? t.tiktok.clips(o.index.count) : t.tiktok.noSyncYet}</small>
      </span>
    </button>
  );
}

const apply = (o: TikTokOverview) => set({ tiktok: o });

export function TikTokPanel() {
  const o = useStore((s) => s.tiktok);
  const settings = useStore((s) => s.settings)!;
  const [busy, setBusy] = useState(false);
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
  const account = 'account' in s && s.account ? s.account : null;
  const isExperimental = account?.adapter === 'web-experimental' || (s.kind === 'authorizing' && s.adapter === 'web-experimental');

  return (
    <div className="tiktok-panel">
      <Panel className={`tiktok-status tone-${statusTone(s)}`}>
        <div className="tiktok-status-head">
          <Icon name="heart" size={28} />
          <div>
            <h3>{t.tiktok.states[s.kind]}</h3>
            {account && <p className="muted">{account.displayName} · {account.adapter === 'portability' ? t.tiktok.official : t.tiktok.experimental}</p>}
          </div>
        </div>

        {s.kind === 'syncing' && (
          <div className="sync-progress" role="status">
            <div className="indeterminate" />
            <p>{t.tiktok.stages[s.stage]}{s.found !== undefined ? ` · ${t.tiktok.experimentalFound(s.found)}` : ''}</p>
            {s.stage === 'preparing' && <p className="hint">{t.tiktok.preparingHint}</p>}
            {s.nextCheckAt && <p className="hint">{t.tiktok.nextCheck(formatDate(s.nextCheckAt))}</p>}
            {s.stage === 'collecting' && <p className="hint">{t.tiktok.experimentalCollect}</p>}
          </div>
        )}
        {s.kind === 'ready' && <p className="big-count">{t.tiktok.clips(s.clipCount)}</p>}
        {s.kind === 'error' && <p className="error-text">{s.message}</p>}
        {s.kind === 'unsupported' && <p className="error-text">{s.detail ?? t.tiktok.unsupported[s.reason]}</p>}
        {s.kind === 'unsupported' && s.detail && <p className="hint">{t.tiktok.unsupported[s.reason]}</p>}
        {s.kind === 'expired' && <p className="error-text">{t.tiktok.states.expired}</p>}
        {o.index ? (
          <p className="muted">{t.tiktok.lastSync(formatDate(o.index.syncedAt))}</p>
        ) : (
          <p className="muted">{t.tiktok.noSyncYet}</p>
        )}
        {o.index && (s.kind === 'error' || s.kind === 'expired') && <p className="hint">{t.tiktok.keptOldData}</p>}

        <div className="row wrap gap">
          {(s.kind === 'disconnected' || s.kind === 'unsupported' || (s.kind === 'error' && !account)) && (
            <Button variant="primary" size="lg" icon="heart" disabled={busy} onClick={() => void run(() => api.tiktok.connect('portability'))}>
              {t.tiktok.connect}
            </Button>
          )}
          {s.kind === 'expired' && (
            <Button variant="primary" icon="refresh" disabled={busy} onClick={() => void run(() => api.tiktok.connect(isExperimental ? 'web-experimental' : 'portability'))}>
              {t.tiktok.reconnect}
            </Button>
          )}
          {(s.kind === 'connected_no_likes' || s.kind === 'ready' || (s.kind === 'error' && account)) && (
            <Button variant="cyan" size="lg" icon="refresh" disabled={busy} onClick={() => void run(() => api.tiktok.sync())}>
              {s.kind === 'ready' ? t.tiktok.resync : s.kind === 'error' ? t.common.retry : t.tiktok.sync}
            </Button>
          )}
          {s.kind === 'syncing' && s.stage === 'collecting' && (
            <Button variant="primary" icon="check" disabled={busy || !s.found} onClick={() => void run(() => api.tiktok.commitCollected())}>
              {t.tiktok.experimentalCommit}
            </Button>
          )}
          {(s.kind === 'syncing' || s.kind === 'authorizing') && (
            <Button variant="ghost" icon="x" disabled={busy} onClick={() => void run(() => api.tiktok.cancel())}>
              {t.tiktok.cancelSync}
            </Button>
          )}
          {(account || o.index) && (
            <Button
              variant="danger"
              icon="logout"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t.tiktok.disconnectConfirm)) void run(() => api.tiktok.disconnect());
              }}
            >
              {t.tiktok.disconnect}
            </Button>
          )}
        </div>
        <p className="hint">{t.tiktok.browserHint}</p>
        {o.officialConfigured === false && s.kind !== 'unsupported' && <p className="hint warn">{t.tiktok.unsupported.adapter_unavailable}</p>}
        {o.officialConfigured === null && <p className="hint">{t.tiktok.serverUnknown}</p>}
      </Panel>

      <Panel title={t.tiktok.experimental}>
        <p className="hint warn">{t.tiktok.experimentalWarn}</p>
        <Toggle
          checked={settings.experimentalWebAdapter}
          label={t.settings.experimentalToggle}
          onChange={async (v) => {
            set({ settings: await api.settings.set({ experimentalWebAdapter: v }) });
            apply(await api.tiktok.overview());
          }}
        />
        {settings.experimentalWebAdapter && (s.kind === 'disconnected' || s.kind === 'unsupported') && (
          <Button variant="secondary" icon="eye" disabled={busy} onClick={() => void run(() => api.tiktok.connect('web-experimental'))}>
            {t.tiktok.experimental}
          </Button>
        )}
      </Panel>

      {o.index && <ProofPanel />}
      {o.index && <ManageClips />}
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
    <Panel title={t.tiktok.proofTitle}>
      <p className="hint">{t.tiktok.proofHint}</p>
      <div className="proof-grid">
        <ol className="proof-list">
          {sample.map((l) => (
            <li key={l.id}>
              <code>{l.id}</code>
              <span className="muted">{l.t ? formatDate(l.t) : '–'}</span>
              <Button size="sm" variant="ghost" icon="play" onClick={() => setPlaying(l.id)}>
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
    </Panel>
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

function ManageClips() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ClipListEntry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (open) void api.tiktok.listClips().then(setList);
  }, [open]);
  return (
    <Panel title={t.tiktok.manageClips}>
      <p className="hint">{t.tiktok.manageHint}</p>
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {open ? t.common.close : t.tiktok.manageClips}
      </Button>
      {open && (
        <div className="proof-grid">
          <ul className="clip-list">
            {list.map((c) => (
              <li key={c.id} className={c.excluded ? 'excluded' : ''}>
                <code>{c.id}</code>
                <span className="muted">{c.t ? formatDate(c.t) : ''}</span>
                <Button size="sm" variant="ghost" icon="eye" onClick={() => setPreview(c.id)} aria-label="Ansehen" />
                <Button
                  size="sm"
                  variant={c.excluded ? 'secondary' : 'ghost'}
                  onClick={async () => {
                    await api.tiktok.setExcluded(c.id, !c.excluded);
                    setList(list.map((x) => (x.id === c.id ? { ...x, excluded: !x.excluded } : x)));
                  }}
                >
                  {c.excluded ? t.tiktok.include : t.tiktok.exclude}
                </Button>
              </li>
            ))}
          </ul>
          {preview && (
            <div className="proof-player">
              <TikTokEmbedStandalone videoId={preview} />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
