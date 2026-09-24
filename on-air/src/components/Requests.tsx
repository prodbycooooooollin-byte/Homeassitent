import { ArrowDown, ArrowUp, Ban, Check, CheckCheck, GripVertical, Lock, MessageSquare, MoreHorizontal, RotateCcw, Sparkles, Star, Trash2, User, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import type { PlanStatus, SongRequest } from "../lib/types";
import { Badge, Cover, toast, toastError } from "./ui";

export type Eta = PlanStatus["etas"][number];

export function sourceIcon(r: SongRequest) {
  if (r.source === "channel_points") return <span className="src points" title={t("q.src_points")}><Sparkles size={12} /></span>;
  if (r.source === "chat") return <span className="src" title={t("q.src_chat")}><MessageSquare size={12} /></span>;
  return <span className="src" title={t("q.src_app")}><User size={12} /></span>;
}

function RedemptionBadge({ r }: { r: SongRequest }) {
  const red = r.redemption;
  if (!red) return null;
  const pending = red.target !== null && red.status !== "fulfilled" && red.status !== "canceled";
  const tone = red.status === "fulfilled" ? "positive" : red.status === "canceled" ? undefined : red.status === "unfulfilled" ? "accent" : "warn";
  return (
    <span title={red.last_error ?? undefined}>
      <Badge tone={tone}><Sparkles size={11} /> {pending ? t("red.pending") : t(`red.${red.status}` as const)}</Badge>
    </span>
  );
}

/** Kurze Statusbezeichnung für schmale Listen. */
function shortLabel(r: SongRequest): string | null {
  if (r.status === "pending_review") return r.pending_reason === "offline" ? t("st.pending_offline") : t("q.short_review");
  if (r.status === "uncertain") return t("q.short_uncertain");
  return null;
}

export function statusBadge(r: SongRequest): { label: string; tone?: "accent" | "warn" | "danger" | "info" | "positive" } {
  switch (r.status) {
    case "pending_review":
      return r.pending_reason === "offline" ? { label: t("st.pending_offline"), tone: "warn" } : { label: t("st.pending_review"), tone: "info" };
    case "accepted":
      return { label: t("st.accepted") };
    case "handing_off":
      return { label: t("st.handing_off"), tone: "info" };
    case "handed_off":
      return { label: t("q.in_spotify"), tone: "positive" };
    case "playing":
      return { label: t("st.playing"), tone: "accent" };
    case "uncertain":
      return { label: t("st.uncertain"), tone: "warn" };
    case "completed":
      return { label: t("st.completed") };
    case "rejected":
      return { label: t("st.rejected"), tone: "danger" };
    case "failed":
      return { label: t("st.failed"), tone: "danger" };
    default:
      return { label: t("st.received") };
  }
}

const act = (action: string, id: string, index?: number) => api.queueAction(action, id, index).catch(toastError);

function RowMenu({ r }: { r: SongRequest }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const block = async (kind: "user" | "track" | "artist") => {
    setOpen(false);
    try {
      if (kind === "user") await api.blockAdd("user", r.requester.id, r.requester.name);
      if (kind === "track" && r.track) await api.blockAdd("track", r.track.id, `${r.track.title} – ${r.track.artists.join(", ")}`);
      if (kind === "artist" && r.track?.artists[0]) await api.blockAdd("artist", r.track.artists[0], r.track.artists[0]);
      toast(t("common.saved"));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn sm" aria-haspopup="menu" aria-expanded={open} aria-label="…" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="card" style={{ position: "absolute", right: 0, top: 34, zIndex: 20, padding: 6, minWidth: 200, display: "flex", flexDirection: "column" }}>
          {r.requester.id !== "local:streamer" && (
            <button role="menuitem" className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => block("user")}>
              <Ban size={14} /> {t("q.block_user")}
            </button>
          )}
          {r.track && (
            <>
              <button role="menuitem" className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => block("track")}>
                <Ban size={14} /> {t("q.block_track")}
              </button>
              <button role="menuitem" className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => block("artist")}>
                <Ban size={14} /> {t("q.block_artist")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RequestRow({
  r,
  compact,
  movable,
  onMove,
  canUp,
  canDown,
  dnd,
  eta,
}: {
  r: SongRequest;
  eta?: Eta;
  compact?: boolean;
  movable?: boolean;
  onMove?: (dir: -1 | 1) => void;
  canUp?: boolean;
  canDown?: boolean;
  dnd?: { onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onDragEnd: () => void; dragging: boolean; dropBefore: boolean };
}) {
  const b = statusBadge(r);
  const title = r.track?.title ?? r.query;
  const artist = r.track?.artists.join(", ") ?? "";
  // In schmalen Zeilen hat die voraussichtliche Startzeit Vorrang vor dem Interpreten (steht im Tooltip).
  const hideArtist = !!compact && !!eta && eta.start_ms !== null && r.status !== "playing";
  const locked = r.status === "handed_off" || r.status === "handing_off" || r.status === "playing";
  return (
    <div
      className={`item state-${r.status} ${compact ? "compact-row" : ""} ${dnd?.dragging ? "dragging" : ""} ${dnd?.dropBefore ? "drop-before" : ""}`}
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
      <div className="row" style={{ gap: 6 }}>
        {!compact && (movable ? <GripVertical size={16} className="handle" aria-hidden="true" /> : <span style={{ width: 16 }} aria-hidden="true" />)}
        <Cover url={r.track?.image_url} className="thumb" />
      </div>
      <div className="col" style={{ gap: 1 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="t ellipsis" title={compact && artist ? `${title} – ${artist}` : title}>{title}</span>
          {r.track?.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
          {r.priority && <Badge tone="warn"><Star size={11} /> {t("q.priority")}</Badge>}
        </div>
        <div className="s row" style={{ gap: 5 }} title={`${artist} · ${r.requester.name}`}>
          {!hideArtist && <span className="ellipsis">{artist}</span>}
          {!hideArtist && artist && <span className="subtle">·</span>}
          {sourceIcon(r)}
          <span className="ellipsis" style={{ color: "var(--text)", flexShrink: 1 }}>{r.requester.name}</span>
          {r.track && !compact ? <span className="subtle num" style={{ flex: "none" }}>· {duration(r.track.duration_ms)}</span> : null}
          {eta && eta.start_ms !== null && r.status !== "playing" && (
            <span className={`eta ${eta.fits === false ? "late" : ""}`} style={{ flex: "none" }} title={eta.fits === false ? t("plan.eta_late") : undefined}>
              · {t("plan.eta", { time: clockTime(eta.start_ms, getLang()) })}{eta.fits === false ? " ⚠" : ""}
            </span>
          )}
        </div>
        {r.status === "uncertain" && !compact && (
          <div className="small" style={{ color: "var(--warn)", marginTop: 2 }}>
            {r.reason === "not_in_spotify_queue" ? t("st.uncertain_hint") : t("st.uncertain_checking")}
          </div>
        )}
      </div>
      <div className="actions">
        {!compact && <RedemptionBadge r={r} />}
        {!compact && r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict") && r.redemption.target === null && (
          <>
            <button className="btn btn-sm" onClick={() => api.redemptionDecide(r.id, true).catch(toastError)}>{t("red.fulfill")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api.redemptionDecide(r.id, false).catch(toastError)}>{t("red.refund")}</button>
          </>
        )}
        {(!compact || r.status !== "accepted") && (
          <span title={locked ? t("q.in_spotify_hint") : movable ? t("q.local_hint") : undefined}>
            <Badge tone={b.tone}>{locked && r.status !== "playing" ? <Lock size={11} /> : null}{compact ? shortLabel(r) ?? b.label : b.label}</Badge>
          </span>
        )}
        {r.status === "pending_review" && r.pending_reason !== "offline" && (
          <>
            <button className="icon-btn sm" aria-label={t("q.approve")} title={t("q.approve")} onClick={() => act("approve", r.id)}><Check size={16} /></button>
            <button className="icon-btn sm" aria-label={t("q.reject")} title={t("q.reject")} onClick={() => act("reject", r.id)}><X size={16} /></button>
          </>
        )}
        {r.status === "uncertain" && r.reason === "not_in_spotify_queue" && (compact ? (
          <>
            <button className="icon-btn sm" aria-label={t("q.retry")} title={t("q.retry")} onClick={() => act("retry", r.id)}><RotateCcw size={15} /></button>
            <button className="icon-btn sm" aria-label={t("q.dismiss")} title={t("q.dismiss")} onClick={() => act("dismiss", r.id)}><CheckCheck size={15} /></button>
          </>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => act("retry", r.id)}><RotateCcw size={14} /> {t("q.retry")}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => act("dismiss", r.id)}><CheckCheck size={14} /> {t("q.dismiss")}</button>
          </>
        ))}
        {movable && !compact && onMove && (
          <>
            <button className="icon-btn sm" aria-label={t("q.move_up")} title={`${t("q.move_up")} (Alt+↑)`} disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
            <button className="icon-btn sm" aria-label={t("q.move_down")} title={`${t("q.move_down")} (Alt+↓)`} disabled={!canDown} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
            <button className="icon-btn sm" aria-label={r.priority ? t("q.unprioritize") : t("q.prioritize")} title={r.priority ? t("q.unprioritize") : t("q.prioritize")} onClick={() => act(r.priority ? "unprioritize" : "prioritize", r.id)}>
              <Star size={15} fill={r.priority ? "currentColor" : "none"} />
            </button>
          </>
        )}
        {movable && (
          <button className={`icon-btn sm ${compact ? "hover-only" : ""}`} aria-label={t("q.remove")} title={t("q.remove")} onClick={() => act("remove", r.id)}><Trash2 size={15} /></button>
        )}
        {!compact && (r.status === "accepted" || r.status === "pending_review") && <RowMenu r={r} />}
      </div>
    </div>
  );
}

/** Liste mit Drag-and-drop für lokal umsortierbare Einträge. */
export function RequestList({ items, compact, etas }: { items: SongRequest[]; compact?: boolean; etas?: Eta[] }) {
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
    <div className="list" role="list">
      {items.map((r) => {
        const movable = r.status === "accepted" || r.status === "pending_review";
        const group = movable ? movableOf(r.priority) : [];
        const gi = group.findIndex((x) => x.id === r.id);
        return (
          <div role="listitem" key={r.id}>
            <RequestRow
              r={r}
              eta={etas?.find((e) => e.id === r.id)}
              compact={compact}
              movable={movable}
              canUp={gi > 0}
              canDown={gi >= 0 && gi < group.length - 1}
              onMove={(d) => move(r, d)}
              dnd={
                compact
                  ? undefined
                  : {
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
                    }
              }
            />
          </div>
        );
      })}
    </div>
  );
}
