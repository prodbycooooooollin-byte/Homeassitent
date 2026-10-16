import { Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { Field, Toggle } from "./ui";
import { getLang, t } from "../lib/i18n";
import type { CustomCommand, Role, Settings } from "../lib/types";

type Update = (fn: (s: Settings) => Settings) => void;

const ROLES: Role[] = ["everyone", "subscriber", "vip", "moderator", "broadcaster"];
const BUILTIN = ["sr", "song", "queue", "remove", "skip", "voteskip", "playlist"] as const;
export const PLACEHOLDERS = ["user", "touser", "args", "channel", "song", "title", "artist", "link", "requester", "queue_count", "next", "playlist", "random:1-100", "pick:a|b|c"];
const MAX = 50;

interface Preset { key: string; name: string; aliases?: string[]; cooldown?: number; role?: Role; de: string; en: string }

/** Vorlagen – `{prefix}` wird beim Einfügen durch das eingestellte Präfix ersetzt. */
export const PRESETS: Preset[] = [
  { key: "discord", name: "discord", aliases: ["dc"], cooldown: 30, de: "Komm auf unseren Discord: https://discord.gg/DEIN-LINK", en: "Join our Discord: https://discord.gg/YOUR-LINK" },
  { key: "socials", name: "socials", cooldown: 30, de: "Folge {channel} auch hier: Instagram @… · TikTok @… · YouTube …", en: "Follow {channel} here too: Instagram @… · TikTok @… · YouTube …" },
  { key: "howto", name: "wunsch", aliases: ["howto"], cooldown: 30, de: "So wünschst du dir einen Song: {prefix}sr Titel Interpret oder ein Spotify-Link 🎵", en: "Request a song with {prefix}sr title artist or a Spotify link 🎵" },
  { key: "link", name: "link", aliases: ["songlink"], cooldown: 10, de: "Läuft gerade: {song} → {link}", en: "Now playing: {song} → {link}" },
  { key: "next", name: "next", aliases: ["nächster"], cooldown: 10, de: "Als Nächstes: {next} · {queue_count} Wünsche warten", en: "Up next: {next} · {queue_count} requests waiting" },
  { key: "who", name: "wer", aliases: ["requester"], cooldown: 10, de: "{song} wurde gewünscht von {requester}", en: "{song} was requested by {requester}" },
  { key: "lurk", name: "lurk", cooldown: 60, de: "{user} geht in den Lurk – danke fürs Dableiben! 👀", en: "{user} is lurking – thanks for sticking around! 👀" },
  { key: "hug", name: "hug", aliases: ["umarmen"], cooldown: 10, de: "{user} umarmt {touser} 🤗", en: "{user} hugs {touser} 🤗" },
  { key: "dice", name: "würfel", aliases: ["dice"], cooldown: 10, de: "{user} würfelt eine {random:1-6} 🎲", en: "{user} rolls a {random:1-6} 🎲" },
  { key: "8ball", name: "8ball", cooldown: 10, de: "🎱 {pick:Ja|Nein|Vielleicht|Frag später nochmal|Auf jeden Fall|Eher nicht}", en: "🎱 {pick:Yes|No|Maybe|Ask again later|Definitely|Unlikely}" },
  { key: "love", name: "love", cooldown: 10, de: "{user} und {touser} passen zu {random:0-100} % zusammen ❤", en: "{user} and {touser} are a {random:0-100}% match ❤" },
];

const SAMPLE: Record<string, string> = {
  user: "Kira", touser: "Tom", args: "@Tom", channel: "streamer", song: "Midnight City – M83", title: "Midnight City", artist: "M83",
  link: "https://open.spotify.com/track/…", requester: "Kira", queue_count: "3", next: "Strobe – deadmau5", playlist: "https://open.spotify.com/playlist/…",
};

/** Vorschau mit Beispielwerten (wie `commands::render_custom` im Kern, Zufall fest). */
export function previewReply(tpl: string): string {
  return tpl.replace(/\{([^{}]+)\}/g, (m, key: string) => {
    if (key in SAMPLE) return SAMPLE[key];
    const r = /^random:(-?\d+)-(-?\d+)$/.exec(key);
    if (r) return String(Math.round((Number(r[1]) + Number(r[2])) / 2));
    if (key.startsWith("pick:")) return key.slice(5).split("|")[0]?.trim() || m;
    return m;
  });
}

const word = (v: string, prefix: string) => {
  let s = v.trim();
  if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length);
  return s.replace(/^!+/, "").split(/\s+/)[0].toLowerCase().slice(0, 30);
};

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function CustomCommands({ draft, update }: { draft: Settings; update: Update }) {
  const c = draft.commands;
  const list = c.custom;
  const [preset, setPreset] = useState("");
  const setList = (fn: (l: CustomCommand[]) => CustomCommand[]) => update((s) => ({ ...s, commands: { ...s.commands, custom: fn(s.commands.custom) } }));
  const patch = (id: string, p: Partial<CustomCommand>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = (p?: Preset) => {
    if (list.length >= MAX) return;
    const text = p ? (getLang() === "en" ? p.en : p.de).split("{prefix}").join(c.prefix) : "";
    const taken = new Set(list.map((x) => x.name));
    let name = p?.name ?? "";
    if (name && taken.has(name)) name = `${name}2`;
    setList((l) => [...l, { id: newId(), enabled: true, name, aliases: p?.aliases ?? [], min_role: p?.role ?? "everyone", cooldown_s: p?.cooldown ?? 10, reply: text, as_reply: false }]);
  };
  const builtinWords = new Set(BUILTIN.flatMap((k) => (c[k].enabled ? [c[k].name, ...c[k].aliases] : [])));
  const conflict = (x: CustomCommand) => {
    const words = [x.name, ...x.aliases].filter(Boolean);
    if (words.some((w) => builtinWords.has(w))) return t("cc.conflict_builtin");
    if (list.some((o) => o.id !== x.id && o.enabled && [o.name, ...o.aliases].some((w) => words.includes(w)))) return t("cc.conflict_custom");
    return null;
  };
  return (
    <section className="card card-pad col" style={{ gap: 14 }} aria-labelledby="cc-title">
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 10 }}>
        <div className="col" style={{ gap: 4, minWidth: 0 }}>
          <h2 id="cc-title">{t("cc.title")}</h2>
          <p className="muted small">{t("cc.desc")}</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="select" style={{ width: 200 }} value={preset} aria-label={t("cc.preset")} onChange={(e) => { const p = PRESETS.find((x) => x.key === e.target.value); if (p) add(p); setPreset(""); }} disabled={list.length >= MAX}>
            <option value="">{t("cc.preset")}</option>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{c.prefix}{p.name} – {t(`cc.p.${p.key}` as never)}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => add()} disabled={list.length >= MAX}><Plus size={15} /> {t("cc.add")}</button>
        </div>
      </div>
      {list.length === 0 && <div className="empty-hint subtle small"><Wand2 size={16} /> {t("cc.empty")}</div>}
      <div className="col" style={{ gap: 12 }}>
        {list.map((x) => {
          const warn = conflict(x);
          return (
            <div key={x.id} className="cc-item" data-testid="custom-command">
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <Toggle checked={x.enabled} onChange={(v) => patch(x.id, { enabled: v })} ariaLabel={`${t("cc.enabled")}: ${c.prefix}${x.name}`} />
                <b className="mono grow ellipsis">{c.prefix}{x.name || "…"}</b>
                <button className="btn btn-ghost btn-sm" aria-label={t("cc.delete")} title={t("cc.delete")} onClick={() => setList((l) => l.filter((o) => o.id !== x.id))}><Trash2 size={15} /></button>
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                <Field label={t("s.cmd.name")}><input className="input mono" value={x.name} placeholder="discord" onChange={(e) => patch(x.id, { name: word(e.target.value, c.prefix) })} /></Field>
                <Field label={t("s.cmd.aliases")}><input className="input mono" value={x.aliases.join(", ")} onChange={(e) => patch(x.id, { aliases: e.target.value.split(",").map((a) => word(a, c.prefix)).filter(Boolean) })} /></Field>
                <Field label={t("s.cmd.role")}>
                  <select className="select" value={x.min_role} onChange={(e) => patch(x.id, { min_role: e.target.value as Role })} aria-label={t("s.cmd.role")}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}` as const)}</option>)}
                  </select>
                </Field>
                <Field label={t("s.cmd.cooldown")}><input className="input" type="number" min={0} max={3600} value={x.cooldown_s} onChange={(e) => patch(x.id, { cooldown_s: Math.min(3600, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
              </div>
              <Field label={t("cc.reply")} hint={`${x.reply.length}/450`}>
                <textarea className="textarea" rows={2} maxLength={450} value={x.reply} placeholder={t("cc.reply_ph")} onChange={(e) => patch(x.id, { reply: e.target.value })} />
              </Field>
              <div className="chips" aria-label={t("cc.placeholders")}>
                {PLACEHOLDERS.map((p) => (
                  <button key={p} type="button" className="chip mono" onClick={() => patch(x.id, { reply: `${x.reply}${x.reply && !x.reply.endsWith(" ") ? " " : ""}{${p}}`.slice(0, 450) })}>{`{${p}}`}</button>
                ))}
              </div>
              {x.reply.trim() && <div className="cc-preview small"><span className="subtle">{t("cc.preview")}</span> {x.as_reply ? `@Kira ${previewReply(x.reply)}` : previewReply(x.reply)}</div>}
              <div className="row wrap" style={{ justifyContent: "space-between", gap: 10 }}>
                <span className="small muted"><Toggle checked={x.as_reply} onChange={(v) => patch(x.id, { as_reply: v })} label={t("cc.as_reply")} /></span>
                {(warn || !x.name) && <span className="small" style={{ color: "var(--warn)" }}>{warn ?? t("cc.name_missing")}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="subtle small">{t("cc.help")}</p>
    </section>
  );
}
