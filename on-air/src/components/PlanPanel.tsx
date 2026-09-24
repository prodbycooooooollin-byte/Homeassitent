import { CalendarClock, Clock, Info, TimerReset } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, hasKey, t } from "../lib/i18n";
import { refresh, useNow } from "../lib/store";
import type { AppSnapshot, PlanStatus } from "../lib/types";
import { Cover, Dialog, Notice, toastError } from "./ui";

const QUICK = [15, 30, 60, 90];

/** Dauer für die Anzeige: ab 10 Minuten in Minuten, darunter mm:ss. Intern bleibt alles in ms. */
export function fmtSpan(ms: number): string {
  const v = Math.max(0, ms);
  return v >= 600_000 ? t("plan.minutes", { n: Math.round(v / 60_000) }) : duration(v);
}

/** Nächstes Auftreten einer lokalen Uhrzeit (heute oder morgen). */
export function nextOccurrence(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function isTomorrow(ms: number, now: number) {
  return new Date(ms).toDateString() !== new Date(now).toDateString();
}

function hhmm(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Live-Werte: Serverstand plus seither vergangene Zeit (nur die Anzeige tickt). */
function live(plan: PlanStatus, now: number): PlanStatus {
  const drift = Math.max(0, now - plan.now_ms);
  const playing = !plan.uncertain.includes("paused");
  const curRem = playing ? Math.max(0, plan.current_remaining_ms - drift) : plan.current_remaining_ms;
  const remaining = plan.remaining_ms - drift;
  const free = remaining - curRem - plan.planned_ms - plan.reserved_ms - plan.buffer_ms;
  return { ...plan, remaining_ms: remaining, current_remaining_ms: curRem, free_ms: free };
}

const run = (p: Promise<unknown>) => p.then(() => refresh(), toastError);

export function PlanPanel({ snap, full }: { snap: AppSnapshot; full?: boolean }) {
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [endInput, setEndInput] = useState("");
  const [bufferMin, setBufferMin] = useState(Math.round(snap.plan_config.buffer_ms / 60_000));
  const [finish, setFinish] = useState(false);
  const [dismissedOver, setDismissedOver] = useState<number | null>(null);
  const cfg = snap.plan_config;
  const active = snap.plan.active;
  const plan = active ? live(snap.plan, now) : snap.plan;

  const start = (end: number | null) => {
    if (!end || end <= Date.now()) return toastError({ code: "error", message: t("plan.invalid_end") });
    return run(api.planSetEnd(end, bufferMin * 60_000));
  };

  if (!active) {
    return (
      <section className="card card-pad col" style={{ gap: 12 }} aria-labelledby="plan-h">
        <div className="row between">
          <div className="col" style={{ gap: 2 }}>
            <span className="eyebrow" id="plan-h">{t("plan.title")}</span>
            <span style={{ fontWeight: 640 }}>{t("plan.toggle")}</span>
          </div>
          <CalendarClock size={20} className="subtle" />
        </div>
        <p className="muted small">{t("plan.intro")}</p>
        <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={t("plan.quick")}>
          <span className="subtle small" style={{ marginRight: 2 }}>{t("plan.quick")}</span>
          {QUICK.map((m) => (
            <button key={m} className="chip-btn" onClick={() => start(Date.now() + m * 60_000)}>
              {t("plan.minutes", { n: m })}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="row small muted" style={{ gap: 6 }}>
            {t("plan.end_time")}
            <input className="input" type="time" style={{ width: 120 }} value={endInput} onChange={(e) => setEndInput(e.target.value)} aria-label={t("plan.end_time")} />
          </label>
          <label className="row small muted" style={{ gap: 6 }}>
            {t("plan.buffer")}
            <input className="input" type="number" min={0} max={30} style={{ width: 70 }} value={bufferMin} onChange={(e) => setBufferMin(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} aria-label={t("plan.buffer")} />
            <span>Min</span>
          </label>
          <button className="btn btn-sm" disabled={!endInput} onClick={() => start(nextOccurrence(endInput, Date.now()))}>{t("plan.start")}</button>
        </div>
        {endInput && nextOccurrence(endInput, now) && isTomorrow(nextOccurrence(endInput, now)!, now) && (
          <span className="subtle small">{t("plan.end")}: {new Date(nextOccurrence(endInput, now)!).toLocaleString(getLang() === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} ({t("plan.tomorrow")})</span>
        )}
        {cfg.end_at_ms && !cfg.enabled && <span className="subtle small">{t("plan.inactive")}</span>}
      </section>
    );
  }

  const end = plan.end_at_ms!;
  const music = plan.current_remaining_ms + plan.planned_ms + plan.reserved_ms;
  const total = Math.max(1, plan.remaining_ms > 0 ? Math.max(plan.remaining_ms, music + plan.buffer_ms) : music + plan.buffer_ms);
  const pct = (v: number) => `${Math.max(0, (100 * v) / total)}%`;
  const over = plan.overplanned_ms > 0 && dismissedOver !== snap.plan.end_at_ms;
  const uncertain = plan.uncertain;

  return (
    <section className="card card-pad col" style={{ gap: 12 }} aria-labelledby="plan-h">
      <div className="row between wrap">
        <div className="col" style={{ gap: 2 }}>
          <span className="eyebrow" id="plan-h">{t("plan.title")}</span>
          <span style={{ fontWeight: 640 }} className="num">
            {t("plan.end")} {clockTime(end, getLang())}
            {isTomorrow(end, now) ? ` (${t("plan.tomorrow")})` : ""} · {plan.ended ? t("plan.ended").split(" – ")[0] : `${t("plan.remaining")} ${fmtSpan(plan.remaining_ms)}`}
          </span>
        </div>
        <Clock size={20} className="subtle" />
      </div>

      <div className="budget" role="img" aria-label={`${t("plan.music")} ${fmtSpan(music)}, ${t("plan.buffer_short")} ${fmtSpan(plan.buffer_ms)}, ${t("plan.free")} ${fmtSpan(plan.free_ms)}`}>
        <i className="b-cur" style={{ width: pct(plan.current_remaining_ms) }} />
        <i className="b-plan" style={{ width: pct(plan.planned_ms) }} />
        {plan.reserved_ms > 0 && <i className="b-res" style={{ width: pct(plan.reserved_ms) }} />}
        <i className="b-buf" style={{ width: pct(plan.buffer_ms) }} />
        {plan.free_ms > 0 ? <i className="b-free" style={{ width: pct(plan.free_ms) }} /> : plan.overplanned_ms > 0 ? <i className="b-over" style={{ width: pct(plan.overplanned_ms) }} /> : null}
      </div>
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtSpan(music)}</div><div className="l">{t("plan.music")}</div></div>
        <div className="kpi"><div className="v">{fmtSpan(plan.buffer_ms)}</div><div className="l">{t("plan.buffer_short")}</div></div>
        <div className={`kpi ${plan.free_ms >= 0 ? "free" : "over"}`}><div className="v">{fmtSpan(Math.abs(plan.free_ms))}</div><div className="l">{plan.free_ms >= 0 ? t("plan.free") : t("plan.too_much")}</div></div>
      </div>
      {full && (
        <div className="legend">
          <span><i style={{ background: "var(--text-2)" }} />{t("plan.current")}</span>
          <span><i style={{ background: "var(--accent)" }} />{t("plan.planned")}</span>
          <span><i style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} />{t("plan.reserved")}</span>
          <span><i style={{ background: "var(--positive)" }} />{t("plan.free")}</span>
        </div>
      )}
      <span className="subtle small">{t("plan.summary_note")}</span>

      {plan.ended ? (
        <Notice tone="warn" title={t("plan.ended")} actions={<button className="btn btn-sm" onClick={() => setFinish(true)}>{t("plan.finish")}</button>} />
      ) : over ? (
        <Notice
          tone="warn"
          title={t("plan.overplanned", { d: fmtSpan(plan.overplanned_ms) })}
          actions={
            <>
              <button className="btn btn-sm" onClick={() => run(api.planExtend(Math.ceil(plan.overplanned_ms / 60_000)))}>{t("plan.over_extend", { m: Math.ceil(plan.overplanned_ms / 60_000) })}</button>
              <button className="btn btn-sm" onClick={() => setFinish(true)}>{t("plan.over_choose")}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDismissedOver(snap.plan.end_at_ms)}>{t("plan.over_continue")}</button>
            </>
          }
        />
      ) : plan.exhausted ? (
        <Notice tone="info" title={t("plan.exhausted")} />
      ) : null}
      {uncertain.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          {uncertain.map((u) => (
            <span key={u} className="row small muted" style={{ gap: 6 }}><Info size={13} /> {hasKey(`plan.uncertain.${u}`) ? t(`plan.uncertain.${u}` as never) : u}</span>
          ))}
          {snap.settings.channel_points.enabled && snap.acceptance.channel_points.blocks.some((b) => b.code === "plan_uncertain") && <span className="small" style={{ color: "var(--warn)" }}>{t("plan.paid_held")}</span>}
        </div>
      )}

      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn btn-sm" onClick={() => run(api.planExtend(15))}><TimerReset size={14} /> {t("plan.extend15")}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setEndInput(hhmm(end)); setEditing((e) => !e); }}>{t("plan.change_end")}</button>
        {!plan.ended && <button className="btn btn-ghost btn-sm" onClick={() => setFinish(true)}>{t("plan.finish")}</button>}
        <div className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={() => run(api.planStop())}>{t("plan.stop")}</button>
      </div>
      {editing && (
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" type="time" style={{ width: 120 }} value={endInput} onChange={(e) => setEndInput(e.target.value)} aria-label={t("plan.change_end")} />
          <label className="row small muted" style={{ gap: 6 }}>
            <input className="input" type="number" min={0} max={30} style={{ width: 70 }} value={bufferMin} onChange={(e) => setBufferMin(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} aria-label={t("plan.buffer")} />
            {t("plan.buffer_short")} (Min)
          </label>
          <button className="btn btn-sm btn-primary" onClick={async () => { await start(nextOccurrence(endInput, Date.now())); setEditing(false); }}>{t("plan.apply")}</button>
        </div>
      )}
      {finish && <FinishDialog snap={snap} onClose={() => setFinish(false)} />}
    </section>
  );
}

function FinishDialog({ snap, onClose }: { snap: AppSnapshot; onClose: () => void }) {
  const open = snap.queue.filter((r) => r.status !== "playing");
  return (
    <Dialog title={t("plan.finish")} onClose={onClose} wide footer={<button className="btn btn-primary" onClick={onClose}>{t("common.done")}</button>}>
      <p className="muted">{t("plan.finish_text")}</p>
      {open.length === 0 ? (
        <p className="subtle">{t("plan.finish_empty")}</p>
      ) : (
        <div className="list card" style={{ boxShadow: "none" }}>
          {open.map((r) => {
            const local = r.status === "accepted" || r.status === "pending_review" || r.status === "received";
            return (
              <div className="item" key={r.id}>
                <Cover url={r.track?.image_url} className="thumb" />
                <div className="col" style={{ gap: 0 }}>
                  <span className="t ellipsis">{r.track?.title ?? r.query}</span>
                  <span className="s ellipsis">{r.track?.artists.join(", ")} · {r.requester.name}{r.redemption ? ` · ${t("q.src_points")}` : ""}</span>
                </div>
                <div className="actions">
                  {local ? (
                    <button className="btn btn-sm btn-danger" onClick={() => run(api.queueAction("remove", r.id))}>{t("plan.cancel_req")}</button>
                  ) : (
                    <span className="subtle small">{t("plan.in_spotify_keep")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => run(api.planStop()).then(onClose)}>{t("plan.stop")}</button>
    </Dialog>
  );
}
