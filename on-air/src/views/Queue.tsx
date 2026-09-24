import { Ban, ListMusic, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchDialog } from "../components/Dialogs";
import { RequestList, RequestRow } from "../components/Requests";
import { EmptyState, Segmented, toast, toastError } from "../components/ui";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, BlockEntry, SongRequest } from "../lib/types";

function Section({ label, hint, items }: { label: string; hint?: string; items: SongRequest[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="section-label" title={hint}>
        {label} · {items.length}
      </div>
      <RequestList items={items} />
    </>
  );
}

export function QueueView({ snap }: { snap: AppSnapshot }) {
  const [adding, setAdding] = useState(false);
  const q = snap.queue;
  const decide = q.filter((r) => r.status === "uncertain");
  const inSpotify = q.filter((r) => r.status === "playing" || r.status === "handed_off" || r.status === "handing_off");
  const review = q.filter((r) => r.status === "pending_review");
  const local = q.filter((r) => r.status === "accepted" || r.status === "received");
  const cmd = `${snap.settings.commands.prefix}${snap.settings.commands.sr.name}`;
  const s = snap.session;
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1>{t("q.title")}</h1>
          <div className="muted small">
            {t("q.stats.pending")}: {q.filter((r) => r.status !== "playing").length} · {t("q.stats.accepted")}: {(s.accepted ?? 0) + (s.handed_off ?? 0) + (s.playing ?? 0) + (s.completed ?? 0)} · {t("q.stats.rejected")}: {s.rejected ?? 0}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("q.add")}
        </button>
      </div>
      <section className="card" aria-label={t("q.title")}>
        {q.length === 0 ? (
          <EmptyState icon={<ListMusic size={20} />} title={t("q.empty")}>
            {snap.settings.requests.open ? t("q.empty_hint_open", { cmd }) : t("q.empty_hint_closed")}
          </EmptyState>
        ) : (
          <div style={{ paddingBottom: 8 }}>
            <Section label={t("q.needs_decision")} items={decide} />
            <Section label={t("q.in_spotify")} hint={t("q.in_spotify_hint")} items={inSpotify} />
            <Section label={t("st.pending_review")} items={review} />
            <Section label={t("q.local")} hint={t("q.local_hint")} items={local} />
            {local.length > 1 && <div className="subtle small" style={{ padding: "8px 20px 4px" }}>{t("q.drag_hint")} (Alt+↑/↓)</div>}
          </div>
        )}
      </section>
      {snap.recent.length > 0 && (
        <section className="card" aria-label={t("q.recent")}>
          <div className="section-label">{t("q.recent")}</div>
          <div className="list" style={{ paddingBottom: 6 }}>
            {snap.recent.slice(0, 8).map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
      <Blocklist />
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}

function Blocklist() {
  const [items, setItems] = useState<BlockEntry[] | null>(null);
  const [kind, setKind] = useState<"user" | "track" | "artist">("artist");
  const [value, setValue] = useState("");
  const load = () => api.blocklist().then(setItems, toastError);
  useEffect(() => void load(), []);
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
  return (
    <section className="card" aria-labelledby="bl-h">
      <div className="card-head">
        <h2 id="bl-h">{t("q.blocklist")}</h2>
      </div>
      <div className="card-body col" style={{ gap: 12 }}>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Segmented
            label={t("q.block_add")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "artist", label: t("q.block_kind.artist") },
              { value: "user", label: t("q.block_kind.user") },
              { value: "track", label: t("q.block_kind.track") },
            ]}
          />
          <input className="input grow" style={{ minWidth: 180 }} placeholder={t("q.block_value")} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("q.block_value")} />
          <button className="btn" type="submit" disabled={!value.trim()}>
            <Ban size={15} /> {t("q.block_add")}
          </button>
        </form>
        {items && items.length === 0 && <div className="subtle small">{t("q.blocklist_empty")}</div>}
        {items && items.length > 0 && (
          <div className="list card" style={{ boxShadow: "none" }}>
            {items.map((b) => (
              <div className="item" key={`${b.kind}:${b.value}`} style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
                <span className="badge">{t(`q.block_kind.${b.kind}` as const)}</span>
                <span className="ellipsis" title={b.value}>{b.label}</span>
                <button className="icon-btn sm" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => api.blockRemove(b.kind, b.value).then(load, toastError)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
