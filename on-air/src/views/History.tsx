import { History as HistoryIcon, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Cover, EmptyState, toast, toastError } from "../components/ui";
import { api } from "../lib/api";
import { clockTime, dateTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot, HistoryEntry } from "../lib/types";

/** Verlauf als Bibliothek: Cover-Raster, Suche oben, „Erneut anfragen“ direkt auf dem Cover. */
export function HistoryView({ snap }: { snap: AppSnapshot; embedded?: boolean }) {
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
  const again = async (h: HistoryEntry) => {
    try {
      const o = await api.addRequest(h.track);
      if (o.outcome === "rejected") toast(`${t("st.rejected")}: ${o.text}`, "error");
      else toast(t("q.added", { title: h.track.title }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 12 }}>
          <span className="kicker">{t("h.kicker")}</span>
          <h1>{t("h.title")}</h1>
          <div className="chips-row">
            <span className="stat-chip">{t("h.session_since", { time: clockTime(snap.session_started_ms, getLang()) })}</span>
            <span className="stat-chip">{t("q.stats.played")} <b>{played}</b></span>
            <span className="stat-chip">{t("q.stats.accepted")} <b>{accepted}</b></span>
            <span className="stat-chip">{t("q.stats.rejected")} <b>{s.rejected ?? 0}</b></span>
          </div>
        </div>
      </div>
      <div className="lib-tools">
        <label className="searchbox">
          <Search size={18} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("h.search")} aria-label={t("h.search")} />
        </label>
        {items && <span className="subtle small">{t("h.count", { n: items.length })}</span>}
      </div>
      {!items ? (
        <div className="library">{Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: "0.8", borderRadius: 24 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="tile"><EmptyState icon={<HistoryIcon size={22} />} title={t("h.empty")} /></div>
      ) : (
        <div className="library" role="list">
          {items.map((h) => (
            <article className="album" key={h.id} role="listitem">
              <div className="art">
                <Cover url={h.track.image_url} />
                <button className="again" disabled={!usable} aria-label={`${t("h.request_again")}: ${h.track.title}`} title={usable ? t("h.request_again") : t("np.disabled_offline")} onClick={() => void again(h)}>
                  <Plus size={20} />
                </button>
              </div>
              <div className="a-title ellipsis" title={h.track.title}>{h.track.title}</div>
              <div className="a-sub ellipsis" title={h.track.artists.join(", ")}>{h.track.artists.join(", ")}</div>
              <div className="a-meta">
                <span className="num">{dateTime(h.played_at, getLang())} · {duration(h.track.duration_ms)}</span>
              </div>
              {h.requester_name && <div className="a-meta"><span className="req ellipsis">{t("np.requested_by", { name: h.requester_name })}</span></div>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
