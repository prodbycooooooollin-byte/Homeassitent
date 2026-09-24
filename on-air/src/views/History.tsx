import { History as HistoryIcon, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Cover, EmptyState, toast, toastError } from "../components/ui";
import { api } from "../lib/api";
import { clockTime, dateTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, HistoryEntry } from "../lib/types";

export function HistoryView({ snap, embedded }: { snap: AppSnapshot; embedded?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const seq = useRef(0);
  const historyTick = snap.spotify.seq; // neu laden, wenn neue Titel beobachtet wurden
  useEffect(() => {
    const my = ++seq.current;
    const id = setTimeout(() => api.history(q).then((r) => my === seq.current && setItems(r), toastError), 200);
    return () => clearTimeout(id);
  }, [q, historyTick]);
  const s = snap.session;
  const played = (s.completed ?? 0) + (s.playing ?? 0);
  const accepted = played + (s.accepted ?? 0) + (s.handed_off ?? 0) + (s.handing_off ?? 0);
  const usable = isSpotifyUsable(snap);
  return (
    <div className={embedded ? "col" : "page"} style={embedded ? { gap: 16 } : undefined}>
      <div className="page-head">
        {!embedded && <h1>{t("h.title")}</h1>}
        <div className="muted small">
          {t("h.session")} ({t("h.session_since", { time: clockTime(snap.session_started_ms, getLang()) })}): {t("q.stats.accepted")} {accepted} · {t("q.stats.rejected")} {s.rejected ?? 0} · {t("q.stats.played")} {played}
        </div>
      </div>
      <div className="row" style={{ position: "relative", maxWidth: 480 }}>
        <Search size={16} className="subtle" style={{ position: "absolute", left: 12 }} aria-hidden="true" />
        <input className="input" style={{ paddingLeft: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("h.search")} aria-label={t("h.search")} />
      </div>
      <section className="card">
        {!items ? (
          <div className="card-body"><div className="skeleton" style={{ height: 160 }} /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<HistoryIcon size={20} />} title={t("h.empty")} />
        ) : (
          <div className="list">
            {items.map((h) => (
              <div className="item" key={h.id}>
                <Cover url={h.track.image_url} className="thumb" />
                <div className="col" style={{ gap: 0 }}>
                  <span className="t ellipsis" title={h.track.title}>{h.track.title}</span>
                  <span className="s ellipsis">
                    {h.track.artists.join(", ")} · {duration(h.track.duration_ms)}
                    {h.requester_name ? <> · <span style={{ color: "var(--accent)" }}>{t("np.requested_by", { name: h.requester_name })}</span></> : null}
                  </span>
                </div>
                <div className="actions">
                  <span className="subtle small" style={{ fontVariantNumeric: "tabular-nums" }}>{dateTime(h.played_at, getLang())}</span>
                  <button
                    className="btn btn-sm"
                    disabled={!usable}
                    title={usable ? t("h.request_again") : t("np.disabled_offline")}
                    onClick={async () => {
                      try {
                        const o = await api.addRequest(h.track);
                        if (o.outcome === "rejected") toast(`${t("st.rejected")}: ${o.text}`, "error");
                        else toast(t("q.added", { title: h.track.title }));
                      } catch (e) {
                        toastError(e);
                      }
                    }}
                  >
                    <Plus size={14} /> {t("h.request_again")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
