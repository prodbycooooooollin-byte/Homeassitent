"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./GameAssets";
import { NavLink } from "./NavLink";
import { useTracker } from "./Providers";
import { fmtAgo } from "@/lib/format";
import { parseAccountId } from "@/lib/steamid";

const NAV = [
  { href: "/", label: "Übersicht" },
  { href: "/matches", label: "Matches" },
  { href: "/heroes", label: "Helden" },
  { href: "/rank", label: "Rang" },
  { href: "/mates", label: "Mitspieler" },
  { href: "/meta", label: "Meta" },
  { href: "/leaderboard", label: "Bestenliste" },
  { href: "/status", label: "Diagnose" },
];

export function TopBar() {
  const { status, account, setAccount, syncNow, syncing, toasts, dismissToast } = useTracker();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const me = status?.players.find((p) => p.accountId === account);
  const ok = me?.lastSyncOk !== false;
  const activeHref = NAV.find((n) => (n.href === "/" ? path === "/" || path.startsWith("/match/") : path.startsWith(n.href)))?.href ?? "/";

  // Gleitender Unterstrich unter dem aktiven Tab
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-href="${activeHref}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeHref, status]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080a10]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-5">
          <NavLink href="/" aria-label="Deadlock Tracker" className="transition hover:scale-[1.03]"><Logo /></NavLink>
          <nav ref={navRef} className="relative hidden h-full items-center gap-0.5 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} data-href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeHref === n.href ? "text-white" : "text-muted hover:text-white"}`}>
                {n.label}
              </NavLink>
            ))}
            <span className="nav-ind" style={{ left: ind.left + 8, width: Math.max(0, ind.width - 16) }} />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SearchBox />
            {me && (
              <button onClick={syncNow} title="Jetzt synchronisieren" className="chip whitespace-nowrap hover:border-white/25">
                <span className={ok ? "live-dot" : "h-2 w-2 rounded-full bg-loss"} />
                <span className="hidden whitespace-nowrap 2xl:inline">
                  {syncing ? "Synchronisiere …" : ok ? `Live · ${me.lastSyncAt ? fmtAgo(me.lastSyncAt / 1000) : "…"}` : "Sync-Fehler"}
                </span>
              </button>
            )}
            {status?.demo && <span className="chip border-amber/40 text-amber">DEMO</span>}
            {status && status.players.length > 0 && (
              <div className="relative">
                <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 transition hover:border-white/25">
                  <Avatar src={me?.avatar} name={me?.name ?? "?"} size={30} ring="#ffffff22" />
                  <span className="hidden max-w-[120px] truncate text-sm font-medium xl:block">{me?.name}</span>
                  <span className="text-muted">▾</span>
                </button>
                {open && (
                  <div className="surface fade-up absolute right-0 mt-2 w-64 overflow-hidden p-1.5" onMouseLeave={() => setOpen(false)}>
                    {status.players.map((p) => (
                      <button key={p.accountId} onClick={() => { setAccount(p.accountId); setOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] ${p.accountId === account ? "bg-white/[0.06]" : ""}`}>
                        <Avatar src={p.avatar} name={p.name} size={28} ring="#ffffff22" />
                        <span className="truncate text-sm">{p.name}</span>
                      </button>
                    ))}
                    <NavLink href="/?add=1" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg border-t border-white/[0.06] px-2 py-2 text-sm text-amber hover:bg-white/[0.06]">＋ Account hinzufügen</NavLink>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Mobile Navigation */}
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.04] px-3 py-1.5 lg:hidden">
          {NAV.map((n) => (
            <NavLink key={n.href} href={n.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${activeHref === n.href ? "bg-white/[0.08] text-white" : "text-muted"}`}>{n.label}</NavLink>
          ))}
        </nav>
      </header>

      <div className="pointer-events-none fixed right-4 top-24 z-40 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <NavLink key={t.id} href={`/match/${t.matchId}?account=${t.account}`} onClick={() => dismissToast(t.id)}
            className="surface toast-in pointer-events-auto flex items-center gap-3 border-amber/40 p-3 hover:border-amber">
            <span className="live-dot" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Neues Match erkannt</span>
              <span className="block text-xs text-muted">#{t.matchId} · jetzt ansehen →</span>
            </span>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissToast(t.id); }} className="text-muted hover:text-white">✕</button>
          </NavLink>
        ))}
      </div>
    </>
  );
}

interface Result { accountId: number; name: string; avatar?: string; matches30d?: number }

/** Spielersuche per Name (Steam-Profile) oder ID – Treffer lassen sich direkt tracken. */
function SearchBox() {
  const { addPlayer, status } = useTracker();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const idFromInput = parseAccountId(q);

  useEffect(() => {
    setErr(null);
    if (q.trim().length < 2 || idFromInput) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setRes(j.results ?? []);
        if (!r.ok) setErr("Suche gerade nicht verfügbar");
      } catch { setErr("Suche gerade nicht verfügbar"); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, idFromInput]);

  const track = async (input: string) => {
    const e = await addPlayer(input);
    setErr(e);
    if (!e) { setQ(""); setFocus(false); router.push("/"); }
  };
  const known = (id: number) => status?.players.some((p) => p.accountId === id);

  return (
    <div className="relative hidden md:block">
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 180)}
        placeholder="Spieler suchen …" className="input !w-44 !rounded-full !py-1.5 pl-9 text-[13px] transition-all focus:!w-64 xl:!w-56" />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
      {focus && q.trim().length >= 2 && (
        <div className="surface fade-up absolute right-0 mt-2 max-h-96 w-80 overflow-y-auto p-1.5">
          {idFromInput && (
            <button onClick={() => track(q)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06]">
              <span>Account <b>{idFromInput}</b> tracken</span><span className="text-amber">＋</span>
            </button>
          )}
          {busy && <div className="px-3 py-2 text-sm text-muted">Suche …</div>}
          {res.map((r) => (
            <button key={r.accountId} onClick={() => track(String(r.accountId))} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]">
              <Avatar src={r.avatar} name={r.name} size={32} ring="#ffffff22" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block text-[11px] text-muted">{r.matches30d !== undefined ? `${r.matches30d} Matches (30 Tage)` : `ID ${r.accountId}`}</span></span>
              <span className="text-xs text-amber">{known(r.accountId) ? "✓ getrackt" : "＋ tracken"}</span>
            </button>
          ))}
          {!busy && !idFromInput && !res.length && !err && <div className="px-3 py-2 text-sm text-muted">Keine Treffer.</div>}
          {err && <div className="px-3 py-2 text-sm text-loss">{err}</div>}
        </div>
      )}
    </div>
  );
}
