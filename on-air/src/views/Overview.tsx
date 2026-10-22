import { Check, CheckCheck, ChevronLeft, ChevronRight, ListMusic, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const SHOWN = 30;

/**
 * Horizontales Karussell: feste Kartenbreite, seitlich scrollbar per Mausrad, Ziehen, Pfeilen
 * und Tastatur; Ränder laufen weich aus, Pfeile erscheinen nur, wenn es weitergeht.
 */
function Strip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Mausrad (vertikal) scrollt die Leiste seitlich – nur wenn sie überhaupt scrollen kann.
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // am Rand: Seite normal weiterscrollen
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 1.2 });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  const page = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className={`strip ${edge.start ? "at-start" : ""} ${edge.end ? "at-end" : ""}`}>
      <button className="strip-nav prev" aria-label={t("common.back")} onClick={() => page(-1)} tabIndex={-1}><ChevronLeft size={20} /></button>
      <div
        ref={ref}
        className="upnext-row"
        role="list"
        onScroll={update}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, left: ref.current!.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !ref.current) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) {
            d.moved = true;
            ref.current.classList.add("dragging");
            ref.current.scrollLeft = d.left - dx;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
          ref.current?.classList.remove("dragging");
        }}
        onPointerLeave={() => {
          drag.current = null;
          ref.current?.classList.remove("dragging");
        }}
      >
        {children}
      </div>
      <button className="strip-nav next" aria-label={t("common.next")} onClick={() => page(1)} tabIndex={-1}><ChevronRight size={20} /></button>
    </div>
  );
}
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
    <div className={`upnext-card ${first ? "active" : ""} state-${r.status}`} role="listitem">
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
          <Strip>
            {upcoming.slice(0, SHOWN).map((r, i) => <UpNextCard key={r.id} r={r} n={i + 2} first={i === 0} />)}
          </Strip>
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
