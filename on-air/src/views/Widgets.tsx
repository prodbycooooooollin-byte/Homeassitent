import { Copy, Eye, FileText, KeyRound, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Notice, Segmented, SettingRow, Toggle, toast, toastError } from "../components/ui";
import { api, copyText, isTauri, pickNowPlayingPath } from "../lib/api";
import { t } from "../lib/i18n";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot, WidgetStyle } from "../lib/types";

type Preset = "minimal" | "glass" | "queue";

const PRESET_DEFAULTS: Record<Preset, Partial<WidgetStyle>> = {
  minimal: { background_opacity: 0, show_progress: false, width: 520, queue_count: 3 },
  glass: { background_opacity: 0.55, show_progress: true, width: 520, queue_count: 3 },
  queue: { background_opacity: 0.7, show_progress: false, width: 420, queue_count: 4 },
};
const BASE: WidgetStyle = {
  font_family: "Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  font_scale: 1,
  text_color: "#F4F4F5",
  secondary_color: "#B4B7BD",
  accent_color: "#7FD6B5",
  background_color: "#101114",
  background_opacity: 0,
  radius: 14,
  width: 520,
  show_cover: true,
  show_progress: false,
  show_requester: true,
  hide_when_paused: false,
  animate: true,
  queue_count: 3,
};

export function widgetUrl(port: number, preset: Preset) {
  return `http://127.0.0.1:${port}/widget/${preset}`;
}

export function WidgetsView({ snap }: { snap: AppSnapshot }) {
  const { draft, update } = useSettingsDraft(snap, 250);
  const [preset, setPreset] = useState<Preset>("glass");
  const [sample, setSample] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const style = draft.overlay[preset];
  const setStyle = (patch: Partial<WidgetStyle>) => update((s) => ({ ...s, overlay: { ...s.overlay, [preset]: { ...s.overlay[preset], ...patch } } }));
  const url = widgetUrl(snap.overlay.port, preset);
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => setFrameKey((k) => k + 1), [preset, sample, snap.overlay.port, snap.overlay.running]);
  const height = preset === "queue" ? 120 + style.queue_count * 44 : preset === "glass" ? 130 : 110;

  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1>{t("w.title")}</h1>
          <p className="muted" style={{ maxWidth: 720 }}>{t("w.subtitle")}</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={t("w.title")}>
        {(["minimal", "glass", "queue"] as Preset[]).map((p) => (
          <button key={p} role="tab" aria-selected={preset === p} onClick={() => setPreset(p)}>
            {t(`w.${p}` as const)}
          </button>
        ))}
      </div>

      <div className="grid-2">
        <div className="col" style={{ gap: 16 }}>
          <div className="card card-pad col" style={{ gap: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="col" style={{ gap: 2 }}>
                <h2>{t(`w.${preset}` as const)}</h2>
                <span className="muted small">{t(`w.${preset}_desc` as const)}</span>
              </div>
              <Segmented
                label={t("w.preview")}
                value={sample ? "sample" : "live"}
                onChange={(v) => setSample(v === "sample")}
                options={[
                  { value: "sample", label: t("w.preview_sample") },
                  { value: "live", label: t("w.preview_live") },
                ]}
              />
            </div>
            <div className="preview-stage">
              {snap.overlay.running ? (
                <iframe key={frameKey} title={t("w.preview")} src={`${url}${sample ? "?preview=1" : ""}`} style={{ height: Math.max(260, height + 40) }} />
              ) : (
                <div style={{ padding: 20 }}>
                  <Notice tone="error" code="overlay_port" technical={snap.overlay.error ?? undefined}>{t("w.preview_unavailable")}</Notice>
                </div>
              )}
            </div>
            <Field label={t("w.url")} hint={t("w.obs_hint", { w: style.width + 24, h: height })}>
              <div className="code-box">
                <code>{url}</code>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (await copyText(url)) toast(t("common.copied"));
                  }}
                >
                  <Copy size={14} /> {t("w.copy_url")}
                </button>
              </div>
            </Field>
            <p className="subtle small">{t("w.music_rights")}</p>
          </div>
        </div>

        <div className="card card-pad col" style={{ gap: 4, alignSelf: "start" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h2>{t("w.style")}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setStyle({ ...BASE, ...PRESET_DEFAULTS[preset] })}>
              <RotateCcw size={14} /> {t("w.reset")}
            </button>
          </div>
          <Range label={t("w.font_scale")} min={0.7} max={1.8} step={0.05} value={style.font_scale} fmt={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setStyle({ font_scale: v })} />
          <Range label={t("w.width")} min={240} max={900} step={10} value={style.width} fmt={(v) => `${v} px`} onChange={(v) => setStyle({ width: v })} />
          <Range label={t("w.radius")} min={0} max={32} step={1} value={style.radius} fmt={(v) => `${v} px`} onChange={(v) => setStyle({ radius: v })} />
          {preset !== "minimal" && (
            <Range label={t("w.bg_opacity")} min={0} max={1} step={0.05} value={style.background_opacity} fmt={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setStyle({ background_opacity: v })} />
          )}
          {preset === "queue" && <Range label={t("w.queue_count")} min={1} max={8} step={1} value={style.queue_count} fmt={(v) => String(v)} onChange={(v) => setStyle({ queue_count: v })} />}
          <div className="row wrap" style={{ gap: 14, padding: "12px 0" }}>
            <ColorField label={t("w.text_color")} value={style.text_color} onChange={(v) => setStyle({ text_color: v })} />
            <ColorField label={t("w.secondary_color")} value={style.secondary_color} onChange={(v) => setStyle({ secondary_color: v })} />
            <ColorField label={t("w.accent_color")} value={style.accent_color} onChange={(v) => setStyle({ accent_color: v })} />
            {preset !== "minimal" && <ColorField label={t("w.bg_color")} value={style.background_color} onChange={(v) => setStyle({ background_color: v })} />}
          </div>
          <Field label={t("w.font")}>
            <select className="select" value={style.font_family} onChange={(e) => setStyle({ font_family: e.target.value })}>
              <option value={BASE.font_family}>Inter / Segoe UI</option>
              <option value="'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif">Segoe UI</option>
              <option value="Georgia, 'Times New Roman', serif">Serif</option>
              <option value="'Cascadia Code', Consolas, ui-monospace, monospace">Mono</option>
            </select>
          </Field>
          <div style={{ marginTop: 6 }}>
            <SettingRow title={t("w.show_cover")}><Toggle checked={style.show_cover} onChange={(v) => setStyle({ show_cover: v })} /></SettingRow>
            {preset !== "minimal" && <SettingRow title={t("w.show_progress")}><Toggle checked={style.show_progress} onChange={(v) => setStyle({ show_progress: v })} /></SettingRow>}
            {preset !== "minimal" && <SettingRow title={t("w.show_requester")}><Toggle checked={style.show_requester} onChange={(v) => setStyle({ show_requester: v })} /></SettingRow>}
            <SettingRow title={t("w.hide_paused")}><Toggle checked={style.hide_when_paused} onChange={(v) => setStyle({ hide_when_paused: v })} /></SettingRow>
            <SettingRow title={t("w.animate")}><Toggle checked={style.animate} onChange={(v) => setStyle({ animate: v })} /></SettingRow>
          </div>
        </div>
      </div>

      <div className="grid-3">
        <div className="card card-pad col" style={{ gap: 12 }}>
          <h3><Eye size={15} style={{ verticalAlign: -2 }} /> {t("w.stale_after")}</h3>
          <p className="muted small">{t("w.stale_after_hint")}</p>
          <div className="row">
            <input className="input num" type="number" min={5} max={600} value={draft.overlay.stale_after_s} onChange={(e) => update((s) => ({ ...s, overlay: { ...s.overlay, stale_after_s: Number(e.target.value) || 20 } }))} aria-label={t("w.stale_after")} />
            <span className="muted">{t("common.seconds")}</span>
          </div>
          <Field label={t("w.port")} hint={t("w.port_hint")}>
            <input className="input num" type="number" min={1024} max={65535} value={draft.overlay.port} onChange={(e) => update((s) => ({ ...s, overlay: { ...s.overlay, port: Number(e.target.value) || 43822 } }))} />
          </Field>
        </div>
        <div className="card card-pad col" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3><FileText size={15} style={{ verticalAlign: -2 }} /> {t("w.file")}</h3>
            <Toggle checked={draft.nowplaying_file.enabled} onChange={(v) => update((s) => ({ ...s, nowplaying_file: { ...s.nowplaying_file, enabled: v } }))} />
          </div>
          <p className="muted small">{t("w.file_desc")}</p>
          <Field label={t("w.file_path")}>
            <div className="input-group">
              <input className="input" value={draft.nowplaying_file.path} onChange={(e) => update((s) => ({ ...s, nowplaying_file: { ...s.nowplaying_file, path: e.target.value } }))} placeholder="C:\\Stream\\nowplaying.txt" />
              <button className="btn" disabled={!isTauri} title={isTauri ? undefined : t("s.app.autostart_unsupported")} onClick={async () => {
                const p = await pickNowPlayingPath();
                if (p) update((s) => ({ ...s, nowplaying_file: { ...s.nowplaying_file, path: p } }));
              }}>{t("w.file_choose")}</button>
            </div>
          </Field>
          <Field label={t("w.file_template")} hint={t("w.file_template_hint")}>
            <input className="input" value={draft.nowplaying_file.template} onChange={(e) => update((s) => ({ ...s, nowplaying_file: { ...s.nowplaying_file, template: e.target.value } }))} />
          </Field>
        </div>
        <div className="card card-pad col" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3><KeyRound size={15} style={{ verticalAlign: -2 }} /> {t("w.control")}</h3>
            <Toggle checked={draft.overlay.control_enabled} onChange={(v) => update((s) => ({ ...s, overlay: { ...s.overlay, control_enabled: v } }))} />
          </div>
          <p className="muted small">{t("w.control_desc")}</p>
          {draft.overlay.control_enabled && (
            token ? (
              <div className="code-box">
                <code>{token}</code>
                <button className="btn btn-sm" onClick={async () => (await copyText(token)) && toast(t("common.copied"))}><Copy size={14} /></button>
              </div>
            ) : (
              <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => api.controlToken().then(setToken, toastError)}>{t("w.control_token")}</button>
            )
          )}
          {draft.overlay.control_enabled && (
            <code className="mono subtle" style={{ wordBreak: "break-all" }}>POST http://127.0.0.1:{snap.overlay.port}/api/control/skip</code>
          )}
        </div>
      </div>
    </div>
  );
}

function Range({ label, min, max, step, value, onChange, fmt }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div className="field" style={{ padding: "6px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="f-label">{label}</span>
        <span className="subtle small" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="col" style={{ gap: 4, alignItems: "center" }}>
      <input type="color" className="swatch" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="subtle small">{label}</span>
    </label>
  );
}
