import { Ban, ListMusic, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchDialog } from "../components/Dialogs";
import { RequestList, RequestRow } from "../components/Requests";
import { Segmented, toast, toastError } from "../components/ui";
import { api } from "../lib/api";
import { gateText } from "../lib/acceptance";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, BlockEntry, SongRequest } from "../lib/types";
import { HistoryView } from "./History";

/** Die tatsächlich aktiven Request-Wege (für leere Zustände). */
export function ActivePaths({ snap }: { snap: AppSnapshot }) {
  const a = snap.acceptance;
  const cmd = `${snap.settings.commands.prefix}${snap.settings.commands.sr.name}`;
  const chips = [];
  // Chip = der Weg (nie umbrechen), Grund darunter als eigene Zeile – so bleibt beides lesbar.
  const path = (key: string, icon: React.ReactNode, label: React.ReactNode, open: boolean, why: string) => (
    <div key={key} className="col" style={{ gap: 3, minWidth: 0 }}>
      <span className="path-chip" title={why}>{icon} {label}</span>
      {!open && <span className="subtle small">{why}</span>}
    </div>
  );
  if (a.chat.configured) chips.push(path("c", <MessageSquare size={12} />, <b>{cmd} &lt;Song&gt;</b>, a.chat.open, gateText(a.chat)));
  if (a.channel_points.configured)
    chips.push(
      path(
        "p",
        <Sparkles size={12} />,
        <><b>„{snap.settings.channel_points.title}“</b> · {snap.settings.channel_points.cost.toLocaleString()}</>,
        a.channel_points.open,
        gateText(a.channel_points),
      ),
    );
  if (!chips.length) return <span className="subtle small">{t("q.no_path")}</span>;
  return <div className="row wrap" style={{ gap: 10, alignItems: "flex-start" }}>{chips}</div>;
}

function Section({ label, hint, items, etas }: { label: string; hint?: string; items: SongRequest[]; etas: AppSnapshot["plan"]["etas"] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="section-label" title={hint}>
        {label} <span className="badge">{items.length}</span>
      </div>
      <RequestList items={items} etas={etas} />
    </>
  );
}

export function QueueView({ snap, initialTab }: { snap: AppSnapshot; initialTab?: "queue" | "history" }) {
  const [tab, setTab] = useState<"queue" | "history">(initialTab ?? "queue");
  const [adding, setAdding] = useState(false);
  const [moderation, setModeration] = useState(false);
  const q = snap.queue;
  const playing = q.filter((r) => r.status === "playing");
  const decide = q.filter((r) => r.status === "uncertain" || (r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict")));
  const inSpotify = q.filter((r) => r.status === "handed_off" || r.status === "handing_off");
  const review = q.filter((r) => r.status === "pending_review");
  const local = q.filter((r) => r.status === "accepted" || r.status === "received");
  const reviewRecent = snap.recent.filter((r) => r.redemption && (r.redemption.status === "review" || r.redemption.status === "conflict"));
  const upcoming = q.filter((r) => r.status !== "playing").length;
  const s = snap.session;
  const etas = snap.plan.etas;
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1>{t("q.title")}</h1>
          <div className="muted small num">
            {t("q.stats.pending")}: {upcoming} · {t("q.stats.accepted")}: {(s.accepted ?? 0) + (s.handed_off ?? 0) + (s.playing ?? 0) + (s.completed ?? 0)} · {t("q.stats.rejected")}: {s.rejected ?? 0}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setModeration(true)}><ShieldCheck size={16} /> {t("q.moderation")}</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> {t("q.add")}</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")}>{t("q.tab_queue")}</button>
        <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>{t("q.tab_history")}</button>
      </div>
      {tab === "history" ? (
        <HistoryView snap={snap} embedded />
      ) : (
        <>
          <section className="card" aria-label={t("q.title")}>
            {q.length === 0 && reviewRecent.length === 0 ? (
              <div className="empty-inline">
                <span className="e-icon"><ListMusic size={19} /></span>
                <div className="col grow" style={{ gap: 6 }}>
                  <span style={{ fontWeight: 620 }}>{t("q.empty")}</span>
                  <ActivePaths snap={snap} />
                </div>
                <button className="btn" onClick={() => setAdding(true)}><Plus size={15} /> {t("q.add")}</button>
              </div>
            ) : (
              <div style={{ paddingBottom: 8 }}>
                <Section label={t("q.group_playing")} items={playing} etas={etas} />
                <Section label={t("q.needs_decision")} items={[...decide.filter((r) => r.status !== "playing"), ...reviewRecent]} etas={etas} />
                <Section label={t("q.in_spotify")} hint={t("q.in_spotify_hint")} items={inSpotify.filter((r) => !decide.includes(r))} etas={etas} />
                <Section label={t("q.group_review")} items={review} etas={etas} />
                <Section label={t("q.local")} hint={t("q.local_hint")} items={local} etas={etas} />
                {local.length > 1 && <div className="subtle small" style={{ padding: "8px 20px 4px" }}>{t("q.drag_hint")} (Alt+↑/↓)</div>}
              </div>
            )}
          </section>
          {snap.recent.length > 0 && (
            <section className="card" aria-label={t("q.recent")}>
              <div className="section-label">{t("q.recent")}</div>
              <div className="list" style={{ paddingBottom: 6 }}>
                {snap.recent.slice(0, 8).map((r) => <RequestRow key={r.id} r={r} />)}
              </div>
            </section>
          )}
        </>
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
              <button className="btn" type="submit" disabled={!value.trim()}><Ban size={15} /></button>
            </form>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="eyebrow">{t("q.blocklist")}</span>
            {items && items.length === 0 && <span className="subtle small">{t("q.blocklist_empty")}</span>}
            {items && items.length > 0 && (
              <div className="list card" style={{ boxShadow: "none" }}>
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
