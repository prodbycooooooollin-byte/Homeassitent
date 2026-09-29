import { Check, CheckCheck, ListMusic, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ActivityLog } from "../components/Activity";
import { Avatar } from "../components/Avatar";
import { SearchDialog } from "../components/Dialogs";
import { NowPlayingCard } from "../components/NowPlaying";
import { PlanPanel } from "../components/PlanPanel";
import { RequestControl } from "../components/RequestControl";
import { statusBadge } from "../components/Requests";
import { Badge, Cover, toastError } from "../components/ui";
import { api } from "../lib/api";
import { duration } from "../lib/format";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, SongRequest } from "../lib/types";
import { ActivePaths } from "./Queue";
import { StatusNotices } from "./StatusNotices";

const SHOWN = 8;
const act = (action: string, id: string) => api.queueAction(action, id).catch(toastError);

/** Karte in der „Als Nächstes“-Leiste (wie im Referenzdesign: Nummer, Cover, Titel, Wünschende*r, Dauer). */
function UpNextCard({ r, n, first }: { r: SongRequest; n: number; first: boolean }) {
  const b = statusBadge(r);
  const title = r.track?.title ?? r.query;
  const artist = r.track?.artists.join(", ") ?? "";
  const review = r.status === "pending_review" && r.pending_reason !== "offline";
  const movable = r.status === "accepted" || r.status === "pending_review";
  const inSpotify = r.status === "handed_off";
  return (
    <div className={`upnext-card ${first ? "active" : ""} state-${r.status}`}>
      <span className="upnext-n num">{String(n).padStart(2, "0")}</span>
      <div className="upnext-coverbox">
        <Cover url={r.track?.image_url} className="upnext-cover" />
        {(review || r.status === "uncertain" || inSpotify || r.redemption?.status === "review") && (
          <div className="upnext-state"><Badge tone={b.tone}>{b.label}</Badge></div>
        )}
        <div className="upnext-actions">
          {review && (
            <>
              <button className="icon-btn sm" aria-label={t("q.approve")} title={t("q.approve")} onClick={() => act("approve", r.id)}><Check size={15} /></button>
              <button className="icon-btn sm" aria-label={t("q.reject")} title={t("q.reject")} onClick={() => act("reject", r.id)}><X size={15} /></button>
            </>
          )}
          {inSpotify && <button className="icon-btn sm" aria-label={t("q.dismiss_stuck")} title={t("q.dismiss_stuck_hint")} onClick={() => act("dismiss", r.id)}><CheckCheck size={15} /></button>}
          {movable && <button className="icon-btn sm" aria-label={t("q.remove")} title={t("q.remove")} onClick={() => act("remove", r.id)}><Trash2 size={15} /></button>}
        </div>
      </div>
      <div className="upnext-meta">
        <span className="upnext-title ellipsis" title={title}>{title}</span>
        <span className="upnext-artist ellipsis" title={artist}>{artist}</span>
        <span className="upnext-foot">
          <Avatar name={r.requester.name} size={22} />
          <span className="ellipsis grow">{r.requester.name}</span>
          {r.source === "channel_points" && <Sparkles size={12} className="subtle" aria-label={t("rc.points")} />}
          {r.track && <span className="num subtle">{duration(r.track.duration_ms)}</span>}
        </span>
      </div>
    </div>
  );
}

export function Overview({ snap, go, onConnectSpotify }: { snap: AppSnapshot; go: (r: string) => void; onConnectSpotify: () => void }) {
  const [adding, setAdding] = useState(false);
  const upcoming = snap.queue.filter((r) => r.status !== "playing");
  return (
    <div className="page live-page">
      <StatusNotices snap={snap} onConnectSpotify={onConnectSpotify} />
      <NowPlayingCard snap={snap} onConnect={onConnectSpotify} />
      <section className="upnext" aria-labelledby="next-h">
        <div className="upnext-head">
          <h2 className="section-title" id="next-h">{t("np.up_next")}</h2>
          <span className="subtle">{upcoming.length === 1 ? t("np.song_one") : t("np.songs", { n: upcoming.length })}</span>
          <div className="grow" />
          {upcoming.length > SHOWN && <button className="btn btn-ghost btn-sm" onClick={() => go("queue")}>{t("q.view_all")}</button>}
          <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={15} /> {t("q.add")}</button>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty-inline card">
            <span className="e-icon"><ListMusic size={19} /></span>
            <div className="col grow" style={{ gap: 6 }}>
              <span style={{ fontWeight: 560 }}>{t("q.empty")}</span>
              <ActivePaths snap={snap} />
            </div>
          </div>
        ) : (
          <div className="upnext-row">
            {upcoming.slice(0, SHOWN).map((r, i) => <UpNextCard key={r.id} r={r} n={i + 2} first={i === 0} />)}
          </div>
        )}
      </section>
      <section className="live-controls" aria-label={t("ov.controls")}>
        <RequestControl snap={snap} onOpenSettings={(s) => go(s)} />
        <PlanPanel snap={snap} />
        <section className="card" aria-labelledby="act-h">
          <div className="card-head"><span className="eyebrow" id="act-h">{t("act.title")}</span></div>
          <ActivityLog items={snap.activity} limit={5} />
        </section>
      </section>
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}
