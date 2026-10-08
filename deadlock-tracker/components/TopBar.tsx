"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./GameAssets";
import { Icon, type IconName } from "./Icon";
import { NavLink } from "./NavLink";
import { useData, useTracker } from "./Providers";
import { fmtAgo } from "@/lib/format";
import { parseAccountId } from "@/lib/steamid";
import { profileViewHref } from "@/lib/primary";

interface NavItem { href: string; label: string; icon: IconName; desc: string }
type NavEntry = ({ kind: "link"; key: string } & NavItem) | { kind: "menu"; key: string; label: string; items: NavItem[] };

/** Hauptnavigation: wenige Einträge, Details in zwei Menüs. */
const NAV: NavEntry[] = [
  { kind: "link", key: "home", href: "/", label: "Übersicht", icon: "grid", desc: "" },
  { kind: "link", key: "live", href: "/live", label: "Live", icon: "eye", desc: "" },
  { kind: "link", key: "matches", href: "/matches", label: "Matches", icon: "list", desc: "" },
  { kind: "link", key: "training", href: "/training", label: "Training", icon: "target", desc: "" },
  { kind: "menu", key: "player", label: "Spieler", items: [
    { href: "/heroes", label: "Helden", icon: "sword", desc: "Deine Helden-Statistiken" },
    { href: "/rank", label: "Rang", icon: "rocket", desc: "Verlauf, Peak und Einordnung" },
    { href: "/achievements", label: "Erfolge", icon: "medal", desc: "Medaillen und Level" },
    { href: "/mates", label: "Mitspieler", icon: "users", desc: "Partner, Premade und Gegner" },
    { href: "/compare", label: "Vergleich", icon: "swap", desc: "Zwei Spieler im Duell" },
  ] },
  { kind: "menu", key: "trends", label: "Trends", items: [
    { href: "/insights", label: "Analyse", icon: "trendUp", desc: "Wann und gegen wen du gewinnst" },
    { href: "/meta", label: "Meta", icon: "layers", desc: "Helden-Tierliste, Builds, Matchups" },
    { href: "/leaderboard", label: "Bestenliste", icon: "trophy", desc: "Die besten Spieler je Region" },
  ] },
];
const FLAT: NavItem[] = NAV.flatMap((n) => (n.kind === "link" ? [n] : n.items));
const isActive = (href: string, path: string) => (href === "/" ? path === "/" || path.startsWith("/match/") : path.startsWith(href));
const entryActive = (n: NavEntry, path: string) => (n.kind === "link" ? isActive(n.href, path) : n.items.some((i) => isActive(i.href, path)));

export function TopBar() {
  const { status, account, primary, setAccount, setPrimary, syncNow, syncing, toasts, dismissToast } = useTracker();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const me = status?.players.find((p) => p.accountId === account);
  const ok = me?.lastSyncOk !== false;
  const activeKey = NAV.find((n) => entryActive(n, path))?.key ?? "home";
  const { live } = useData();
  const [menu, setMenu] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setMenu(null), [path]);

  // Gleitender Unterstrich unter dem aktiven Tab
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-key="${activeKey}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeKey, status, live]);

  return (
    <>
      <header className="topbar sticky top-0 z-30 border-b border-white/[0.06] bg-[#080a10]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-[1560px] items-center gap-4 px-5">
          <NavLink href="/" aria-label="Deadlock Tracker" className="transition hover:scale-[1.03]"><Logo /></NavLink>
          <nav ref={navRef} className="relative hidden h-full items-center gap-1 lg:flex">
            {NAV.map((n) => {
              const active = activeKey === n.key;
              const cls = `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "text-white" : "text-muted hover:text-white"}`;
              if (n.kind === "link") {
                return (
                  <NavLink key={n.key} href={n.href} data-key={n.key} className={cls}>
                    {n.key === "live" && <span className={live ? "live-pulse !h-2 !w-2" : "h-2 w-2 rounded-full bg-white/20"} />}{n.label}
                  </NavLink>
                );
              }
              return (
                <div key={n.key} className="relative h-full" onMouseEnter={() => { clearTimeout(closeTimer.current); setMenu(n.key); }} onMouseLeave={() => { closeTimer.current = setTimeout(() => setMenu((m) => (m === n.key ? null : m)), 140); }}>
                  <button data-key={n.key} onClick={() => setMenu((m) => (m === n.key ? null : n.key))} className={`${cls} h-full`} aria-expanded={menu === n.key}>
                    {n.label}<Icon name="chevron" size={12} className={`transition-transform ${menu === n.key ? "-rotate-90" : "rotate-90"}`} />
                  </button>
                  {menu === n.key && (
                    <div className="surface fade-up absolute left-0 top-[calc(100%-6px)] z-40 w-72 overflow-hidden p-1.5 shadow-2xl">
                      {n.items.map((it) => (
                        <NavLink key={it.href} href={it.href} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.07] ${isActive(it.href, path) ? "bg-white/[0.06]" : ""}`}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-amber"><Icon name={it.icon} size={16} /></span>
                          <span className="min-w-0"><span className="block text-sm font-semibold">{it.label}</span><span className="block truncate text-[11px] text-muted">{it.desc}</span></span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
            <NavLink href="/settings" aria-label="Einstellungen" title="Einstellungen" className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-muted transition hover:border-white/25 hover:text-white ${path.startsWith("/settings") ? "!border-amber/50 !text-amber" : ""}`}><Icon name="sliders" size={17} /></NavLink>
            {status && status.players.length > 0 && (
              <div className="relative">
                <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 transition hover:border-white/25">
                  <Avatar src={me?.avatar} name={me?.name ?? "?"} size={30} ring="#ffffff22" />
                  <span className="hidden max-w-[120px] truncate text-sm font-medium xl:block">{me?.name}</span>
                  <Icon name="chevron" size={14} className="rotate-90 text-muted" />
                </button>
                {open && (
                  <div className="surface fade-up absolute right-0 mt-2 w-64 overflow-hidden p-1.5" onMouseLeave={() => setOpen(false)}>
                    {status.players.map((p) => (
                      <div key={p.accountId} className={`group flex items-center gap-1 rounded-lg pr-1 hover:bg-white/[0.06] ${p.accountId === account ? "bg-white/[0.06]" : ""}`}>
                        <button onClick={() => { setAccount(p.accountId); setOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                          <Avatar src={p.avatar} name={p.name} size={28} ring="#ffffff22" />
                          <span className="truncate text-sm">{p.name}</span>
                          {p.accountId === primary && <span className="chip ml-auto !py-0 text-[10px] text-amber">Ich</span>}
                        </button>
                        {p.accountId !== primary && <button onClick={() => { setPrimary(p.accountId); setOpen(false); }} title="Als meinen Account festlegen" className="rounded-md px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition hover:text-white group-hover:opacity-100">Als Ich</button>}
                      </div>
                    ))}
                    <NavLink href="/status" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg border-t border-white/[0.06] px-2 py-2 text-sm text-muted hover:bg-white/[0.06] hover:text-white"><Icon name="sliders" size={15} />Einstellungen</NavLink>
                    <NavLink href="/?add=1" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-amber hover:bg-white/[0.06]"><Icon name="plusSign" size={15} />Account hinzufügen</NavLink>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Mobile Navigation */}
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.04] px-3 py-1.5 lg:hidden">
          {FLAT.map((n) => (
            <NavLink key={n.href} href={n.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive(n.href, path) ? "bg-white/[0.08] text-white" : "text-muted"}`}>{n.label}</NavLink>
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
              <span className="block text-xs text-muted">#{t.matchId} · jetzt ansehen</span>
            </span>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissToast(t.id); }} className="text-muted hover:text-white"><Icon name="x" size={16} /></button>
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

  const close = () => { setQ(""); setFocus(false); };
  /** Fremde Spieler nur ansehen – ohne Tracking und ohne die Kontoauswahl zu ändern. */
  const view = (id: number) => { close(); router.push(profileViewHref(id)); };
  const track = async (input: string) => {
    const e = await addPlayer(input);
    setErr(e);
    if (!e) close();
  };
  const known = (id: number) => status?.players.some((p) => p.accountId === id);

  return (
    <div className="relative hidden md:block">
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 180)}
        placeholder="Spieler suchen …" className="input !w-44 !rounded-full !py-1.5 pl-9 text-[13px] transition-all focus:!w-64 xl:!w-56" />
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      {focus && q.trim().length >= 2 && (
        <div className="surface fade-up absolute right-0 mt-2 max-h-96 w-80 overflow-y-auto p-1.5">
          {idFromInput && (
            <div className="flex items-center gap-1 rounded-lg hover:bg-white/[0.06]">
              <button onClick={() => view(idFromInput)} className="flex-1 px-3 py-2 text-left text-sm">Profil <b>{idFromInput}</b> ansehen</button>
              {!known(idFromInput) && <button onClick={() => track(q)} className="btn btn-ghost !mr-1 !px-2 !py-1 text-xs" title="Zusätzlich tracken"><Icon name="plusSign" size={13} />Tracken</button>}
            </div>
          )}
          {busy && <div className="px-3 py-2 text-sm text-muted">Suche …</div>}
          {res.map((r) => (
            <div key={r.accountId} className="flex items-center gap-1 rounded-lg hover:bg-white/[0.06]">
              <button onClick={() => view(r.accountId)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left">
                <Avatar src={r.avatar} name={r.name} size={32} ring="#ffffff22" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block text-[11px] text-muted">{r.matches30d !== undefined ? `${r.matches30d} Matches (30 Tage)` : `ID ${r.accountId}`}</span></span>
              </button>
              {known(r.accountId)
                ? <span className="pr-2 text-[11px] text-muted">getrackt</span>
                : <button onClick={() => track(String(r.accountId))} className="btn btn-ghost !mr-1 !px-2 !py-1 text-xs" title="Zusätzlich tracken"><Icon name="plusSign" size={13} />Tracken</button>}
            </div>
          ))}
          {!busy && !idFromInput && !res.length && !err && <div className="px-3 py-2 text-sm text-muted">Keine Treffer.</div>}
          {err && <div className="px-3 py-2 text-sm text-loss">{err}</div>}
        </div>
      )}
    </div>
  );
}
