"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./GameAssets";
import { LogoMark } from "./Logo";
import { useTracker } from "./Providers";
import { parseAccountId } from "@/lib/steamid";

interface Result { accountId: number; name: string; avatar?: string; matches30d?: number }

export function Onboarding({ first }: { first: boolean }) {
  const { addPlayer, status } = useTracker();
  const router = useRouter();
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result[]>([]);
  const id = parseAccountId(v);

  useEffect(() => {
    if (v.trim().length < 2 || id) { setRes([]); return; }
    const t = setTimeout(async () => {
      try { setRes((await (await fetch(`/api/search?q=${encodeURIComponent(v.trim())}`)).json()).results ?? []); } catch { setRes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [v, id]);

  const go = async (input: string) => {
    setBusy(true); setErr(null);
    const e = await addPlayer(input);
    setBusy(false);
    if (e) setErr(e); else { setV(""); router.replace("/"); }
  };

  return (
    <div className="relative mx-auto mt-8 max-w-xl text-center">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-amber/25 blur-[90px]" style={{ animation: "float-glow 9s ease-in-out infinite" }} />
      <div className="relative">
        <div className="float mx-auto w-fit"><LogoMark size={104} /></div>
        <h1 className="display mt-5 text-5xl font-extrabold tracking-tight"><span className="text-gold-grad">Deadlock</span> Tracker</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">Jedes Match direkt nach dem Spiel – mit Match Summary, Rang der Lobby und deiner Performance-Note.</p>
        <form className="surface mt-8 p-5 text-left" onSubmit={(e) => { e.preventDefault(); if (id) go(v); }}>
          <label className="label" htmlFor="acc">Spieler suchen oder Steam-ID eingeben</label>
          <input id="acc" className="input mt-2" value={v} onChange={(e) => setV(e.target.value)} autoFocus
            placeholder="Name, Steam-ID oder steamcommunity.com/profiles/…" />
          <p className="mt-2 text-xs text-muted">
            Namenssuche über Steam-Profile · Steam32/Steam64-ID oder Profil-Link.{status?.demo && " Demo-Modus: jede Zahl funktioniert."}
          </p>
          {res.length > 0 && (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {res.map((r) => (
                <button type="button" key={r.accountId} onClick={() => go(String(r.accountId))} disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-left transition hover:border-amber/50 hover:bg-white/[0.06]">
                  <Avatar src={r.avatar} name={r.name} size={36} ring="#ffffff22" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span>
                    <span className="text-xs text-muted">{r.matches30d !== undefined ? `${r.matches30d} Matches in 30 Tagen` : `ID ${r.accountId}`}</span></span>
                  <span className="text-xs text-amber">Tracken →</span>
                </button>
              ))}
            </div>
          )}
          {err && <p className="mt-3 text-sm text-loss">{err}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={busy || !id} className="btn btn-gold flex-1 disabled:opacity-40">{busy ? "Verbinde …" : id ? `Account ${id} tracken` : "Tracking starten"}</button>
            {!first && <button type="button" onClick={() => router.replace("/")} className="btn btn-ghost">Abbrechen</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
