import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Info, Link2, ListMusic, Plus, RefreshCw, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { duration } from "../lib/format";
import { t } from "../lib/i18n";
import type { CollectionInfo, Origin, ResolveError, SongRequest, SourceItem, SourceProvider, Track, Verdict } from "../lib/types";
import { Badge, Cover, Dialog, EmptyState, Notice, toast, toastError } from "./ui";

const LINK = /^(https?:\/\/|spotify:)/i;

const PROVIDER_LABEL: Record<SourceProvider, string> = { spotify: "Spotify", youtube: "YouTube", apple_music: "Apple Music", soundcloud: "SoundCloud" };

/** Verständlicher Text zu einem Auflösungsfehler. */
export function resolveErrorText(e: ResolveError): string {
  const p = e.provider ? PROVIDER_LABEL[e.provider] : "";
  switch (e.code) {
    case "no_spotify_match": return t("add.err.no_match");
    case "source_not_accessible": return t("add.err.private", { provider: p });
    case "unsupported_content": return e.what?.startsWith("host:") ? t("add.err.host") : t("add.err.unsupported");
    case "provider_setup_required": return t("add.err.setup", { provider: p });
    case "provider_disabled": return t("add.err.disabled", { provider: p });
    case "provider_unavailable": return t("add.err.unavailable", { provider: p });
    case "provider_rate_limited": return t("add.err.rate", { provider: p });
    case "not_a_song": return t("add.err.not_song");
    case "spotify_offline": return t("add.err.spotify");
    default: return t("q.search_empty");
  }
}

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; text: string; code: string }
  | { kind: "tracks"; tracks: Track[]; origin: Origin | null; heading: string | null }
  | { kind: "collection"; info: CollectionInfo; items: SourceItem[]; next: string | null; loadingMore: boolean };

/** Prüfstatus je Titel (gleiche Regeln wie bei der Annahme, ohne etwas zu reservieren). */
function useVerdicts(tracks: Track[], replaceId: string | null) {
  const [map, setMap] = useState<Record<string, Verdict | "loading">>({});
  const key = tracks.map((x) => x.id).join(",");
  useEffect(() => {
    let dead = false;
    const todo = tracks.filter((x) => !(x.id in map));
    if (!todo.length) return;
    setMap((m) => ({ ...m, ...Object.fromEntries(todo.map((x) => [x.id, "loading" as const])) }));
    const id = setTimeout(async () => {
      for (const tr of todo) {
        try {
          const v = await api.precheck(tr, replaceId);
          if (!dead) setMap((m) => ({ ...m, [tr.id]: v }));
        } catch {
          if (!dead) setMap((m) => { const n = { ...m }; delete n[tr.id]; return n; });
        }
      }
    }, 150);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, replaceId]);
  return map;
}

function VerdictBadge({ v }: { v: Verdict | "loading" | undefined }) {
  if (!v || v === "loading") return <span className="verdict subtle"><CircleDashed size={13} className="spin" /> {t("add.checking")}</span>;
  if (v.blocking) return <span className="verdict danger" title={v.blocking.text}><XCircle size={13} /> {v.blocking.text}</span>;
  const info = v.notices[0];
  if (info) return <span className={`verdict ${info.code === "duplicate_position" || info.code === "moderation" ? "warn" : "info"}`} title={v.notices.map((n) => n.text).join(" · ")}><Info size={13} /> {info.text}</span>;
  return <span className="verdict ok"><CheckCircle2 size={13} /> {t("add.ok")}</span>;
}

function TrackRow({ tr, verdict, onPick, busy, action }: { tr: Track; verdict: Verdict | "loading" | undefined; onPick: () => void; busy: boolean; action: string }) {
  const blocked = verdict !== undefined && verdict !== "loading" && !!verdict.blocking;
  return (
    <div className="item add-row">
      <Cover url={tr.image_url} className="thumb" />
      <div className="col" style={{ gap: 2, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="t ellipsis" title={tr.title}>{tr.title}</span>
          {tr.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
        </div>
        <span className="s ellipsis">{tr.artists.join(", ")}{tr.album ? ` · ${tr.album}` : ""} · {duration(tr.duration_ms)}</span>
        <VerdictBadge v={verdict} />
      </div>
      <button className="btn btn-sm" onClick={onPick} disabled={busy || blocked || verdict === "loading" || verdict === undefined} aria-label={`${action}: ${tr.title}`}>
        <Plus size={14} /> {action}
      </button>
    </div>
  );
}

function OriginLine({ origin }: { origin: Origin | null }) {
  if (!origin || !origin.provider || origin.provider === "spotify") return null;
  return (
    <div className="origin-line small muted">
      <Link2 size={13} /> {t("add.origin", { provider: PROVIDER_LABEL[origin.provider] })}
      {origin.title ? <> · <span className="ellipsis">„{origin.artists[0] ? `${origin.artists[0]} – ` : ""}{origin.title}“</span></> : null}
    </div>
  );
}

/**
 * „Song hinzufügen“ bzw. „Song ändern“: Suchtext oder Musiklink (Spotify, YouTube, Apple Music,
 * SoundCloud). Playlists/Alben öffnen eine Auswahl; jeder Titel zeigt vorab, ob er angenommen würde.
 */
export function AddSongDialog({ onClose, disabledReason, replace }: { onClose: () => void; disabledReason?: string | null; replace?: SongRequest | null }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });
  const [back, setBack] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const seq = useRef(0);
  const replaceId = replace?.id ?? null;

  // Eingabe entprellen; veraltete Antworten werden verworfen.
  useEffect(() => {
    const input = q.trim();
    if (input.length < 2) {
      setView({ kind: "idle" });
      setBack(null);
      return;
    }
    const my = ++seq.current;
    const id = setTimeout(async () => {
      setView({ kind: "loading" });
      setBack(null);
      try {
        if (!LINK.test(input)) {
          const list = await api.search(input);
          if (my === seq.current) setView({ kind: "tracks", tracks: list, origin: null, heading: null });
          return;
        }
        const r = await api.resolveInput(input);
        if (my !== seq.current) return;
        if (r.kind === "track") setView({ kind: "tracks", tracks: [r.track], origin: r.origin, heading: t("add.found") });
        else if (r.kind === "versions") setView({ kind: "tracks", tracks: r.options, origin: r.origin, heading: t("add.versions") });
        else if (r.kind === "collection") setView({ kind: "collection", info: r.collection, items: r.page.items, next: r.page.next, loadingMore: false });
        else setView({ kind: "error", code: r.error.code, text: resolveErrorText(r.error) });
      } catch (e) {
        if (my === seq.current) setView({ kind: "error", code: (e as { code: string }).code, text: (e as { message: string }).message });
      }
    }, 400);
    return () => clearTimeout(id);
  }, [q]);

  const tracks = view.kind === "tracks" ? view.tracks : [];
  const verdicts = useVerdicts(tracks, replaceId);

  const pick = async (track: Track, origin: Origin | null) => {
    if (busy) return;
    setBusy(true);
    try {
      if (replace) {
        const f = await api.replaceRequest(replace.id, track, origin);
        if (f.flow === "replaced") {
          toast(t("add.replaced", { title: track.title }));
          onClose();
        } else if (f.flow === "replace_failed") toast(f.text, "error");
        else if (f.flow === "notice") toast(t(`add.notice.${f.notice.code}` as "add.notice.replace_locked"), "error");
      } else {
        const o = await api.addRequest(track, origin);
        if (o.outcome === "rejected") toast(`${t("st.rejected")}: ${o.text}`, "error");
        else toast(t("q.added", { title: track.title }));
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const pickItem = async (item: SourceItem, info: CollectionInfo) => {
    const prev = view;
    setBusy(true);
    try {
      const r = await api.matchItem(item);
      if (r.kind === "track") {
        setBack(prev);
        setView({ kind: "tracks", tracks: [r.track], origin: { ...r.origin, method: "user_choice", collection: info.url }, heading: t("add.confirm") });
      } else if (r.kind === "versions") {
        setBack(prev);
        setView({ kind: "tracks", tracks: r.options, origin: { ...r.origin, collection: info.url }, heading: t("add.versions") });
      } else if (r.kind === "failed") toast(resolveErrorText(r.error), "error");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (view.kind !== "collection" || !view.next) return;
    const cur = view;
    setView({ ...cur, loadingMore: true });
    try {
      const r = await api.collectionPage(cur.info.ref, cur.next);
      setView({ ...cur, items: [...cur.items, ...r.page.items], next: r.page.next, loadingMore: false });
    } catch (e) {
      toastError(e);
      setView({ ...cur, loadingMore: false });
    }
  };

  const filtered = useMemo(() => {
    if (view.kind !== "collection") return [];
    const f = filter.trim().toLowerCase();
    return f ? view.items.filter((i) => `${i.title} ${i.artists.join(" ")} ${i.uploader ?? ""}`.toLowerCase().includes(f)) : view.items;
  }, [view, filter]);

  const action = replace ? t("add.take") : t("q.add");
  const title = replace ? t("add.replace_title") : t("q.add_title");

  return (
    <Dialog title={title} onClose={onClose} wide>
      {replace && (
        <div className="replace-current small">
          <RefreshCw size={14} /> {t("add.replace_current", { title: replace.track?.title ?? replace.query, user: replace.requester.name })}
          <span className="subtle"> · {t("add.replace_keep")}</span>
        </div>
      )}
      {disabledReason ? (
        <Notice tone="warn" code={disabledReason} />
      ) : (
        <>
          <div className="row" style={{ position: "relative" }}>
            {LINK.test(q.trim()) ? <Link2 size={16} className="subtle" style={{ position: "absolute", left: 12 }} aria-hidden="true" /> : <Search size={16} className="subtle" style={{ position: "absolute", left: 12 }} aria-hidden="true" />}
            <input className="input" style={{ paddingLeft: 36, height: 42 }} placeholder={t("add.placeholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("add.placeholder")} autoFocus spellCheck={false} />
          </div>
          <p className="subtle small" style={{ margin: 0 }}>{t("add.sources_hint")}</p>

          {view.kind === "loading" && <div className="row muted small" role="status"><CircleDashed size={15} className="spin" /> {t("add.resolving")}</div>}
          {view.kind === "error" && <div className="notice warn" role="alert"><AlertTriangle size={16} /> <span>{view.text}</span></div>}
          {view.kind === "tracks" && view.tracks.length === 0 && <EmptyState icon={<Search size={20} />} title={t("q.search_empty")} />}

          {view.kind === "tracks" && view.tracks.length > 0 && (
            <div className="col" style={{ gap: 8 }}>
              {back && (
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setView(back); setBack(null); }}>
                  <ArrowLeft size={14} /> {t("add.back_to_list")}
                </button>
              )}
              {view.heading && <div className="add-heading">{view.heading}</div>}
              <OriginLine origin={view.origin} />
              <div className="list card" style={{ boxShadow: "none" }}>
                {view.tracks.map((tr) => (
                  <TrackRow key={tr.id} tr={tr} verdict={verdicts[tr.id]} busy={busy} action={action} onPick={() => pick(tr, view.origin ? { ...view.origin, method: view.tracks.length > 1 ? "user_choice" : view.origin.method } : null)} />
                ))}
              </div>
              {view.origin?.playlist_hint && (
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setQ(view.origin!.playlist_hint!)}>
                  <ListMusic size={14} /> {t("add.open_playlist")}
                </button>
              )}
            </div>
          )}

          {view.kind === "collection" && (
            <div className="col" style={{ gap: 10 }}>
              <div className="coll-head">
                <Cover url={view.info.image_url} className="thumb" />
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="t ellipsis">{view.info.name ?? t("add.playlist")}</span>
                  <span className="s">
                    {PROVIDER_LABEL[view.info.ref.provider]} · {view.info.ref.kind === "album" ? t("add.album") : t("add.playlist")} ·{" "}
                    {view.info.total != null ? t("add.loaded_of", { n: view.items.length, total: view.info.total }) : t("add.loaded", { n: view.items.length })}
                  </span>
                </div>
              </div>
              <input className="input" placeholder={t("add.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("add.filter")} />
              {view.next && filter && <span className="subtle small">{t("add.filter_partial")}</span>}
              <div className="list card coll-list" style={{ boxShadow: "none" }}>
                {filtered.map((it) => (
                  <div className="item add-row" key={`${it.provider}:${it.id}`}>
                    <Cover url={it.image_url} className="thumb" />
                    <div className="col" style={{ gap: 2, minWidth: 0 }}>
                      <span className="t ellipsis" title={it.title}>{it.title}</span>
                      <span className="s ellipsis">
                        {it.artists.length ? it.artists.join(", ") : it.uploader ? t("add.uploader", { name: it.uploader }) : "–"}
                        {it.duration_ms ? ` · ${duration(it.duration_ms)}` : ""}
                      </span>
                      {!it.available && <span className="verdict danger"><XCircle size={13} /> {t("add.unavailable")}</span>}
                    </div>
                    <button className="btn btn-sm" disabled={busy || !it.available} onClick={() => pickItem(it, view.info)} aria-label={`${t("add.choose")}: ${it.title}`}>
                      {t("add.choose")}
                    </button>
                  </div>
                ))}
                {filtered.length === 0 && <div className="item muted small">{t("q.search_empty")}</div>}
              </div>
              {view.next && (
                <button className="btn btn-sm" style={{ alignSelf: "center" }} onClick={loadMore} disabled={view.loadingMore}>
                  {view.loadingMore ? <CircleDashed size={14} className="spin" /> : null} {t("add.load_more")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
