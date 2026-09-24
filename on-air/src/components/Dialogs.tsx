import { CheckCircle2, CircleDashed, Plus, Search, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { describeError } from "../lib/errors";
import { duration } from "../lib/format";
import { hasKey, t } from "../lib/i18n";
import type { Check, Track } from "../lib/types";
import { Badge, Cover, Dialog, EmptyState, Notice, toast, toastError } from "./ui";

export function SearchDialog({ onClose, disabledReason }: { onClose: () => void; disabledReason?: string | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const seq = useRef(0);

  // Suche mit kurzer Verzögerung; veraltete Antworten werden verworfen.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    const my = ++seq.current;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(query);
        if (my === seq.current) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (my === seq.current) setError(e as { code: string; message: string });
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  const add = async (track: Track) => {
    setAdding(track.id);
    try {
      const o = await api.addRequest(track);
      if (o.outcome === "rejected") toast(`${t("st.rejected")}: ${o.text}`, "error");
      else toast(t("q.added", { title: track.title }));
    } catch (e) {
      toastError(e);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog title={t("q.add_title")} onClose={onClose} wide>
      {disabledReason ? (
        <Notice tone="warn" code={disabledReason} />
      ) : (
        <>
          <div className="row" style={{ position: "relative" }}>
            <Search size={16} className="subtle" style={{ position: "absolute", left: 12 }} aria-hidden="true" />
            <input className="input" style={{ paddingLeft: 36, height: 42 }} placeholder={t("q.search_placeholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("q.search_placeholder")} autoFocus />
          </div>
          {error && <Notice tone="error" code={error.code} technical={error.message} />}
          {busy && !results && <div className="skeleton" style={{ height: 180 }} />}
          {results && results.length === 0 && <EmptyState icon={<Search size={20} />} title={t("q.search_empty")} />}
          {results && results.length > 0 && (
            <div className="list card" style={{ boxShadow: "none", opacity: busy ? 0.6 : 1 }}>
              {results.map((tr) => (
                <div className="item" key={tr.id}>
                  <Cover url={tr.image_url} className="thumb" />
                  <div className="col" style={{ gap: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="t ellipsis" title={tr.title}>{tr.title}</span>
                      {tr.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
                    </div>
                    <span className="s ellipsis">
                      {tr.artists.join(", ")}
                      {tr.album ? ` · ${tr.album}` : ""} · {duration(tr.duration_ms)}
                    </span>
                  </div>
                  <button className="btn btn-sm" onClick={() => add(tr)} disabled={adding !== null}>
                    <Plus size={14} /> {t("q.add")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

const ICON = {
  ok: <CheckCircle2 size={17} color="var(--accent)" />,
  warn: <AlertTriangle size={17} color="var(--warn)" />,
  error: <XCircle size={17} color="var(--danger)" />,
  skipped: <MinusCircle size={17} color="var(--text-3)" />,
};

export function DiagnosticsDialog({ onClose, target = "all" }: { onClose: () => void; target?: "all" | "spotify" | "twitch" | "overlay" }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const run = () => {
    setChecks(null);
    api.diagnostics(target).then(setChecks, (e) => {
      toastError(e);
      setChecks([]);
    });
  };
  useEffect(run, [target]);
  return (
    <Dialog
      title={t("diag.title")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={run} disabled={!checks}>{t("common.retry")}</button>
          <button className="btn btn-primary" onClick={onClose}>{t("common.done")}</button>
        </>
      }
    >
      <p className="muted small">{t("diag.hint")}</p>
      {!checks ? (
        <div className="row muted"><CircleDashed size={16} className="spin" /> {t("diag.running")}</div>
      ) : (
        <div>
          {checks.map((c) => {
            const key = `diag.${c.id}`;
            const label = hasKey(key) ? t(key) : c.id;
            const d = describeError(c.code);
            return (
              <div className="check-row" key={c.id}>
                {ICON[c.status]}
                <div className="col" style={{ gap: 2 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 560 }}>{label}</span>
                    {c.status === "ok" && c.detail && <span className="subtle small ellipsis">{c.detail}</span>}
                  </div>
                  {c.status !== "ok" && c.status !== "skipped" && (
                    <div className="small muted">
                      <b style={{ color: "var(--text)" }}>{d.title}.</b> {d.action}
                    </div>
                  )}
                  {c.status !== "ok" && c.detail && (
                    <details className="tech">
                      <summary>{t("common.details")}</summary>
                      <pre>{c.code}: {c.detail}</pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
