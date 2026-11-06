import { ArrowDown, ArrowUp, Ban, Check, CheckCheck, GripVertical, Lock, MessageSquare, Plus, RotateCcw, ShieldCheck, Sparkles, Star, Trash2, User, X } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { SearchDialog } from "../components/Dialogs";
import { RedemptionBadge, RowMenu, statusBadge, type Eta } from "../components/Requests";
import { Badge, Cover, Segmented, toast, toastError } from "../components/ui";
import { gateText } from "../lib/acceptance";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, BlockEntry, SongRequest } from "../lib/types";
import { HistoryView } from "./History";

/** Die tatsächlich aktiven Request-Wege (für leere Zustände). */
export function ActivePaths({ snap }: { snap: AppSnapshot }) {
  const a = snap.acceptance;
  const cmd = `${snap.settings.commands.prefix}${snap.settings.commands.sr.name}`;
  const chips = [];
  const path = (key: string, icon: React.ReactNode, label: React.ReactNode, open: boolean, why: string) => (
    <div key={key} className="col" style={{ gap: 3, minWidth: 0 }}>
      <span className="path-chip" title={why}>{icon} {label}</span>
      {!open && <span className="subtle small">{why}</span>}
    </div>
  );
  if (a.chat.configured) chips.push(path("c", <MessageSquare size={12} />, <b>{cmd} &lt;Song&gt;</b>, a.chat.open, gateText(a.chat)));
  if (a.channel_points.configured)
    chips.push(path("p", <Sparkles size={12} />, <><b>„{snap.settings.channel_points.title}“</b> · {snap.settings.channel_points.cost.toLocaleString()}</>, a.channel_points.open, gateText(a.channel_points)));
  if (!chips.length) return <span className="subtle small">{t("q.no_path")}</span>;
  return <div className="row wrap" style={{ gap: 10, alignItems: "flex-start" }}>{chips}</div>;
}

const act = (action: string, id: string, index?: number) => api.queueAction(action, id, index).catch(toastError);

type Dnd = { onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onDragEnd: () => void; dragging: boolean; dropBefore: boolean };

/** Ticket: ein Wunsch als Karte mit allen Aktionen seines Zustands. */
function Ticket({ r, pos, eta, movable, canUp, canDown, onMove, dnd }: { r: SongRequest; pos?: number; eta?: Eta; movable?: boolean; canUp?: boolean; canDown?: boolean; onMove?: (d: -1 | 1) => void; dnd?: Dnd }) {
  const b = statusBadge(r);
  const title = r.track?.title ?? r.query;
  const artist = r.track?.artists.join(", ") ?? "";
  const locked = r.status === "handed_off" || r.status === "handing_off";
  const decide = r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict") && r.redemption.target === null;
  const cls = r.status === "playing" ? "playing" : r.status === "uncertain" || decide ? "warn" : pos === 1 ? "first" : "";
  return (
    <div
      className={`ticket state-${r.status} ${cls} ${dnd?.dragging ? "dragging" : ""} ${dnd?.dropBefore ? "drop-before" : ""}`}
      role="listitem"
      draggable={!!dnd && movable}
      onDragStart={dnd?.onDragStart}
      onDragOver={dnd?.onDragOver}
      onDrop={dnd?.onDrop}
      onDragEnd={dnd?.onDragEnd}
      onKeyDown={(e) => {
        if (!movable || !onMove || !e.altKey) return;
        if (e.key === "ArrowUp" && canUp) { e.preventDefault(); onMove(-1); }
        if (e.key === "ArrowDown" && canDown) { e.preventDefault(); onMove(1); }
      }}
    >
      {pos ? <span className="tk-pos num">{pos}</span> : null}
      <span className={`grip ${movable ? "" : "off"}`} aria-hidden="true"><GripVertical size={15} /></span>
      <Cover url={r.track?.image_url} className="tk-cover" />
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="tk-title t ellipsis" title={title}>{title}</span>
          {r.track?.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
          {r.priority && <Badge tone="warn"><Star size={10} /> {t("q.priority")}</Badge>}
        </div>
        <div className="tk-sub ellipsis" title={artist}>{artist}</div>
        <div className="tk-meta">
          {r.source === "channel_points" ? <Sparkles size={12} className="src points" aria-label={t("q.src_points")} /> : r.source === "chat" ? <MessageSquare size={12} aria-label={t("q.src_chat")} /> : <User size={12} aria-label={t("q.src_app")} />}
          <span className="who ellipsis">{r.requester.name}</span>
          {r.track && <span className="num">· {duration(r.track.duration_ms)}</span>}
          {eta && eta.start_ms !== null && r.status !== "playing" && (
            <span className={`eta ${eta.fits === false ? "late" : ""}`} title={eta.fits === false ? t("plan.eta_late") : undefined}>
              · {t("plan.eta", { time: clockTime(eta.start_ms, getLang()) })}{eta.fits === false ? " ⚠" : ""}
            </span>
          )}
          <RedemptionBadge r={r} />
          {(locked || r.status === "playing" || r.status === "uncertain" || r.status === "pending_review") && (
            <Badge tone={b.tone}>{locked ? <Lock size={10} /> : null}{b.label}</Badge>
          )}
        </div>
      </div>
      <div className="tk-actions actions">
        {decide && (
          <>
            <button className="btn btn-sm" onClick={() => api.redemptionDecide(r.id, true).catch(toastError)}>{t("red.fulfill")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api.redemptionDecide(r.id, false).catch(toastError)}>{t("red.refund")}</button>
          </>
        )}
        {r.status === "pending_review" && r.pending_reason !== "offline" && (
          <>
            <button className="icon-btn sm" aria-label={t("q.approve")} title={t("q.approve")} onClick={() => act("approve", r.id)} style={{ color: "var(--positive)" }}><Check size={17} /></button>
            <button className="icon-btn sm" aria-label={t("q.reject")} title={t("q.reject")} onClick={() => act("reject", r.id)} style={{ color: "var(--danger)" }}><X size={17} /></button>
          </>
        )}
        {r.status === "uncertain" && r.reason === "not_in_spotify_queue" && (
          <>
            <button className="btn btn-sm" onClick={() => act("retry", r.id)}><RotateCcw size={14} /> {t("q.retry")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => act("dismiss", r.id)}><CheckCheck size={14} /> {t("q.dismiss")}</button>
          </>
        )}
        {(r.status === "handed_off" || r.status === "playing") && (
          <button className="icon-btn sm hover-only" aria-label={t("q.dismiss_stuck")} title={t("q.dismiss_stuck_hint")} onClick={() => act("dismiss", r.id)}><CheckCheck size={15} /></button>
        )}
        {movable && onMove && (
          <>
            <button className="icon-btn sm hover-only" aria-label={t("q.move_up")} title={`${t("q.move_up")} (Alt+↑)`} disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
            <button className="icon-btn sm hover-only" aria-label={t("q.move_down")} title={`${t("q.move_down")} (Alt+↓)`} disabled={!canDown} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
            <button className={`icon-btn sm ${r.priority ? "" : "hover-only"}`} aria-label={r.priority ? t("q.unprioritize") : t("q.prioritize")} title={r.priority ? t("q.unprioritize") : t("q.prioritize")} onClick={() => act(r.priority ? "unprioritize" : "prioritize", r.id)}>
              <Star size={15} fill={r.priority ? "currentColor" : "none"} />
            </button>
          </>
        )}
        {movable && <button className="icon-btn sm" aria-label={t("q.remove")} title={t("q.remove")} onClick={() => act("remove", r.id)}><Trash2 size={15} /></button>}
        {(r.status === "accepted" || r.status === "pending_review") && <RowMenu r={r} />}
      </div>
      {r.status === "uncertain" && <div className="tk-note">{r.reason === "not_in_spotify_queue" ? t("st.uncertain_hint") : t("st.uncertain_checking")}</div>}
    </div>
  );
}

/** Spalte mit Drag-and-drop für lokal umsortierbare Einträge. */
function TicketList({ items, etas, numbered }: { items: SongRequest[]; etas: Eta[]; numbered?: boolean }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const movableOf = (prio: boolean) => items.filter((r) => (r.status === "accepted" || r.status === "pending_review") && r.priority === prio);
  const move = (r: SongRequest, dir: -1 | 1) => {
    const group = movableOf(r.priority);
    const i = group.findIndex((x) => x.id === r.id);
    void act("move", r.id, Math.max(0, i + dir));
  };
  const dropOn = (target: SongRequest) => {
    const dragged = items.find((x) => x.id === dragId);
    setDragId(null);
    setOverId(null);
    if (!dragged || dragged.id === target.id || dragged.priority !== target.priority) return;
    const others = movableOf(dragged.priority).filter((x) => x.id !== dragged.id);
    const idx = others.findIndex((x) => x.id === target.id);
    if (idx >= 0) void act("move", dragged.id, idx);
  };
  return (
    <div className="lane-body list" role="list">
      {items.map((r, i) => {
        const movable = r.status === "accepted" || r.status === "pending_review";
        const group = movable ? movableOf(r.priority) : [];
        const gi = group.findIndex((x) => x.id === r.id);
        return (
          <Ticket
            key={r.id}
            r={r}
            pos={numbered ? i + 1 : undefined}
            eta={etas.find((e) => e.id === r.id)}
            movable={movable}
            canUp={gi > 0}
            canDown={gi >= 0 && gi < group.length - 1}
            onMove={(d) => move(r, d)}
            dnd={{
              dragging: dragId === r.id,
              dropBefore: overId === r.id && dragId !== r.id,
              onDragStart: (e) => {
                setDragId(r.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.id);
              },
              onDragOver: (e) => {
                if (!dragId || !movable) return;
                e.preventDefault();
                setOverId(r.id);
              },
              onDrop: (e) => {
                e.preventDefault();
                dropOn(r);
              },
              onDragEnd: () => {
                setDragId(null);
                setOverId(null);
              },
            }}
          />
        );
      })}
    </div>
  );
}

function Lane({ title, n, tone, hint, className, children, empty }: { title: string; n: number; tone?: "hot" | "acc" | "live"; hint?: string; className?: string; children: React.ReactNode; empty: string }) {
  return (
    <section className={`lane ${className ?? ""}`} aria-label={title}>
      <div className="lane-head">
        <h2>{title}</h2>
        <span className={`n ${n > 0 ? tone ?? "" : ""}`}>{n}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {n === 0 ? <div className="lane-empty">{empty}</div> : children}
    </section>
  );
}

export function QueueView({ snap, initialTab }: { snap: AppSnapshot; initialTab?: "queue" | "history" }) {
  const tab: "queue" | "history" = initialTab ?? "queue";
  const [adding, setAdding] = useState(false);
  const [moderation, setModeration] = useState(false);
  if (tab === "history") return <HistoryView snap={snap} />;
  const q = snap.queue;
  const etas = snap.plan.etas;
  const playing = q.filter((r) => r.status === "playing");
  const inSpotify = q.filter((r) => r.status === "handed_off" || r.status === "handing_off");
  const decide = q.filter((r) => r.status === "uncertain" || (r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict")));
  const reviewRecent = snap.recent.filter((r) => r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict"));
  const review = q.filter((r) => r.status === "pending_review");
  const local = q.filter((r) => r.status === "accepted" || r.status === "received");
  const check = [...decide.filter((r) => r.status !== "playing"), ...reviewRecent, ...review.filter((r) => !decide.includes(r))];
  const total = local.reduce((a, r) => a + (r.track?.duration_ms ?? 0), 0);
  const s = snap.session;
  const accepted = (s.accepted ?? 0) + (s.handed_off ?? 0) + (s.playing ?? 0) + (s.completed ?? 0);
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 12 }}>
          <span className="kicker">{t("q.kicker")}</span>
          <h1>{t("q.title")}</h1>
          <div className="chips-row">
            <span className="stat-chip">{t("q.stats.pending")} <b>{q.filter((r) => r.status !== "playing").length}</b></span>
            <span className="stat-chip">{t("q.stats.accepted")} <b>{accepted}</b></span>
            <span className="stat-chip">{t("q.stats.rejected")} <b>{s.rejected ?? 0}</b></span>
            {local.length > 0 && <span className="stat-chip">{t("stack.total")} <b>{duration(total)}</b></span>}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setModeration(true)}><ShieldCheck size={16} /> {t("q.moderation")}</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> {t("q.add")}</button>
        </div>
      </div>

      {q.length === 0 && reviewRecent.length === 0 && (
        <div className="tile empty-inline">
          <span className="e-icon"><Plus size={19} /></span>
          <div className="col grow" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{t("q.empty")}</span>
            <ActivePaths snap={snap} />
          </div>
        </div>
      )}

      <div className="board">
        <Lane title={t("lane.check")} n={check.length + (snap.awaiting?.length ?? 0)} tone="hot" empty={t("lane.check_empty")}>
          <TicketList items={check} etas={etas} />
          {(snap.awaiting?.length ?? 0) > 0 && (
            <div className="lane-body">
              <div className="lane-sub">{t("q.awaiting")}</div>
              {snap.awaiting!.map((r) => (
                <div className="ticket" key={r.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="tk-title ellipsis" title={r.query}>{r.query}</div>
                    <div className="tk-meta"><span className="who">{r.requester.name}</span> · <span>{t("st.awaiting_selection")}</span></div>
                  </div>
                  <button className="icon-btn sm" aria-label={t("q.remove")} title={t("q.remove")} onClick={() => act("remove", r.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Lane>
        <Lane title={t("np.up_next")} n={local.length} tone="acc" hint={local.length > 1 ? `${t("q.drag_hint")} · Alt+↑/↓` : t("q.local_hint")} className="lane-next" empty={t("lane.next_empty")}>
          <TicketList items={local} etas={etas} numbered />
        </Lane>
        <Lane title={t("lane.live")} n={playing.length + inSpotify.length} tone="live" hint={t("q.in_spotify_hint")} empty={t("lane.live_empty")}>
          <TicketList items={[...playing, ...inSpotify.filter((r) => !decide.includes(r))]} etas={etas} />
        </Lane>
      </div>

      {snap.recent.length > 0 && (
        <section className="col" style={{ gap: 10 }} aria-label={t("q.recent")}>
          <span className="section-title" style={{ padding: "6px 4px 0" }}>{t("q.recent")}</span>
          <div className="recent-strip">
            {snap.recent.slice(0, 12).map((r) => {
              const b = statusBadge(r);
              return (
                <div className="recent-chip" key={r.id} title={r.reason_text ?? undefined}>
                  <Cover url={r.track?.image_url} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 700, fontSize: 13.5 }}>{r.track?.title ?? r.query}</div>
                    <div className="row" style={{ gap: 6 }}><span className="subtle small ellipsis">{r.requester.name}</span><Badge tone={b.tone}>{b.label}</Badge></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {moderation && <ModerationSheet snap={snap} onClose={() => setModeration(false)} />}
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}

function ModerationSheet({ snap, onClose }: { snap: AppSnapshot; onClose: () => void }) {
  const [items, setItems] = useState<BlockEntry[] | null>(null);
  const [kind, setKind] = useState<"user" | "track" | "artist">("artist");
  const [value, setValue] = useState("");
  const load = () => api.blocklist().then(setItems, toastError);
  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const add = async () => {
    const v = value.trim();
    if (!v) return;
    try {
      await api.blockAdd(kind, v, v);
      setValue("");
      toast(t("common.saved"));
      void load();
    } catch (e) {
      toastError(e);
    }
  };
  const reviews = snap.queue.filter((r) => r.status === "pending_review").length;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="mod-h">
        <div className="sheet-head">
          <h2 id="mod-h">{t("q.moderation")}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label={t("common.close")}><X size={16} /></button>
        </div>
        <div className="sheet-body">
          <div className="kpis">
            <div className="kpi"><div className="v">{reviews}</div><div className="l">{t("q.open_reviews")}</div></div>
            <div className="kpi"><div className="v">{snap.channel_points.needs_review}</div><div className="l">{t("red.review")}</div></div>
            <div className="kpi"><div className="v">{items?.length ?? "–"}</div><div className="l">{t("q.blocklist")}</div></div>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <span className="eyebrow">{t("q.block_add")}</span>
            <Segmented label={t("q.block_add")} value={kind} onChange={setKind} options={[{ value: "artist", label: t("q.block_kind.artist") }, { value: "user", label: t("q.block_kind.user") }, { value: "track", label: t("q.block_kind.track") }]} />
            <form className="input-group" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <input className="input" placeholder={t("q.block_value")} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("q.block_value")} />
              <button className="btn" type="submit" disabled={!value.trim()} aria-label={t("q.block_add")}><Ban size={15} /></button>
            </form>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="eyebrow">{t("q.blocklist")}</span>
            {items && items.length === 0 && <span className="subtle small">{t("q.blocklist_empty")}</span>}
            {items && items.length > 0 && (
              <div className="list">
                {items.map((b) => (
                  <div className="item" key={`${b.kind}:${b.value}`}>
                    <span className="badge">{t(`q.block_kind.${b.kind}` as const)}</span>
                    <span className="ellipsis" title={b.value}>{b.label}</span>
                    <button className="icon-btn sm" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => api.blockRemove(b.kind, b.value).then(load, toastError)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
