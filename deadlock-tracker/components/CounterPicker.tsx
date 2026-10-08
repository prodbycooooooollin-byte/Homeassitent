"use client";
import { useEffect, useMemo, useState } from "react";
import { HeroPortrait, useAssets, useHeroName } from "./GameAssets";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";
import { rankCounters, reasonFor, type EnemyMatchups, type Pick } from "@/lib/counter";
import type { HeroAgg } from "@/lib/view";

const MAX = 6;

export function CounterPicker({ heroes }: { heroes: HeroAgg[] }) {
  const { bundle } = useAssets();
  const nameOf = useHeroName();
  const [sel, setSel] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [mm, setMm] = useState<EnemyMatchups>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const all = useMemo(() => Object.values(bundle.heroes).sort((a, b) => a.name.localeCompare(b.name, "de")), [bundle]);
  const shown = useMemo(() => all.filter((h) => h.name.toLowerCase().includes(q.trim().toLowerCase())), [all, q]);

  const key = sel.join(",");
  useEffect(() => {
    if (!sel.length) { setMm({}); setErr(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/counter-picker?heroes=${key}`)
      .then((r) => r.json())
      .then((j: { matchups?: EnemyMatchups; errors?: string[] }) => { if (alive) { setMm(j.matchups ?? {}); if (j.errors?.length) setErr("Matchup-Daten sind gerade nicht vollständig verfügbar."); } })
      .catch(() => { if (alive) setErr("Matchup-Daten konnten nicht geladen werden."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]);
  const result = useMemo(() => sel.length ? rankCounters(all.map((h) => h.id), sel, mm, heroes) : null, [all, sel, mm, heroes]);
  const hasData = !!result && result.picks.some((p) => p.matchup !== null);

  return (
    <div className="space-y-5">
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Gegnerische Helden</div>
            <p className="mt-1 text-sm text-muted">Wähle bis zu {MAX} Helden aus dem gegnerischen Team. Der Score mischt die globale Matchup-Winrate (Ranked, letzte 3 Wochen) mit deiner eigenen Erfahrung.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="num text-sm text-muted">{sel.length} / {MAX}</span>
            {sel.length > 0 && <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setSel([])}><Icon name="x" size={14} />Zurücksetzen</button>}
          </div>
        </div>
        <div className="mt-3 flex min-h-[52px] flex-wrap items-center gap-2">
          {sel.length === 0 && <span className="text-sm text-white/40">Noch keine Gegner gewählt.</span>}
          {sel.map((id) => (
            <button key={id} onClick={() => toggle(id)} className="chip !pl-1 hover:border-loss/60" title="Entfernen">
              <HeroPortrait id={id} size={32} variant="small" /> {nameOf(id)} <Icon name="x" size={12} className="text-white/50" />
            </button>
          ))}
        </div>
        <div className="relative mt-3">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input className="input !pl-9" placeholder="Held suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
          {shown.map((h) => {
            const on = sel.includes(h.id);
            const full = !on && sel.length >= MAX;
            return (
              <button key={h.id} onClick={() => toggle(h.id)} disabled={full} title={h.name}
                className={`group flex flex-col items-center gap-1 rounded-xl border p-1.5 transition ${on ? "border-loss/70 bg-loss/10" : "border-white/[0.06] bg-white/[0.02] hover:border-white/25"} ${full ? "opacity-30" : ""}`}>
                <HeroPortrait id={h.id} size={48} variant="small" ring={on ? "#f0616d" : undefined} />
                <span className="w-full truncate text-center text-[10px] text-white/70">{h.name}</span>
              </button>
            );
          })}
          {shown.length === 0 && <div className="col-span-full py-4 text-center text-sm text-muted">{all.length ? "Kein Held gefunden." : "Helden werden geladen …"}</div>}
        </div>
      </div>

      {result && (
        <>
          {err && <div className="surface flex items-center gap-2 border-amber/30 p-3 text-sm text-amber"><Icon name="alert" size={16} />{err}</div>}
          {loading && <div className="skeleton h-24" />}
          {!loading && !hasData && !err && <div className="surface p-5 text-sm text-muted">Für diese Auswahl liegen keine Matchup-Daten vor. Die Rangliste basiert nur auf deiner Erfahrung.</div>}
          {!loading && (
            <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
              <div className="space-y-3">
                <div className="label">Empfohlene Helden</div>
                {result.picks.slice(0, 12).map((p, i) => <PickRow key={p.heroId} p={p} rank={i + 1} sel={sel} nameOf={nameOf} />)}
              </div>
              <div className="space-y-3">
                <div className="label">Meiden</div>
                {result.avoid.length === 0 && <div className="surface p-4 text-sm text-muted">Keine Daten.</div>}
                {result.avoid.map((p) => (
                  <div key={p.heroId} className="surface flex items-center gap-3 p-3">
                    <HeroPortrait id={p.heroId} size={44} variant="small" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{nameOf(p.heroId)}</div>
                      <div className="text-xs text-muted">{p.vs.length ? `schwächer gegen ${nameOf([...p.vs].sort((a, b) => a.wr - b.wr)[0].enemyId)}` : ""}</div>
                    </div>
                    <div className="num text-right"><div className="font-bold text-loss">{Math.round((p.matchup ?? 0) * 100)} %</div><div className="label !text-[9px]">Matchup</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PickRow({ p, rank, sel, nameOf }: { p: Pick; rank: number; sel: number[]; nameOf: (id: number) => string }) {
  const sc = p.score >= 60 ? "#3ecf8e" : p.score >= 45 ? "#f0b44c" : "#f0616d";
  return (
    <NavLink href={`/heroes/${p.heroId}`} className="block">
      <div className="surface surface-hover flex items-center gap-4 p-4">
        <div className="display num w-6 text-center text-lg font-bold text-white/40">{rank}</div>
        <HeroPortrait id={p.heroId} size={56} variant="small" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="display truncate text-lg font-bold">{nameOf(p.heroId)}</span>
            {p.isNew && <span className="chip !border-sapphire/40 !bg-sapphire/10 !py-0.5 !text-[10px] text-sapphire">Neu für dich</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted">{reasonFor(p, nameOf)}{sel.length > 0 && p.vs.length < sel.length ? ` (Daten zu ${p.vs.length} von ${sel.length} Gegnern)` : ""}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${p.score}%`, background: sc }} /></div>
        </div>
        <div className="num hidden gap-5 text-center sm:flex">
          <div><div className="font-bold">{p.matchup === null ? "–" : `${Math.round(p.matchup * 100)} %`}</div><div className="label !text-[9px]">Matchup</div></div>
          <div><div className="font-bold">{p.ownWr === null ? "–" : `${Math.round(p.ownWr * 100)} %`}</div><div className="label !text-[9px]">Deine WR ({p.ownMatches})</div></div>
        </div>
        <div className="text-right"><div className="display num text-3xl font-extrabold" style={{ color: sc }}>{p.score}</div><div className="label !text-[9px]">Score</div></div>
      </div>
    </NavLink>
  );
}
