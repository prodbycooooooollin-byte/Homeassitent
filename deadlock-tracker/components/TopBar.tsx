"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./GameAssets";
import { useTracker } from "./Providers";
import { fmtAgo } from "@/lib/format";

export function TopBar() {
  const { status, account, setAccount, syncNow, syncing, toasts, dismissToast } = useTracker();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const me = status?.players.find((p) => p.accountId === account);
  const ok = me?.lastSyncOk !== false;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080a10]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5">
          <a href="/" aria-label="Deadlock Tracker"><Logo /></a>
          <nav className="hidden gap-1 md:flex">
            <a href="/" className={`tab ${path === "/" ? "tab-active" : ""}`}>Profil</a>
            <a href="/#matches" className="tab">Matches</a>
            <a href="/#heroes" className="tab">Helden</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <button onClick={syncNow} title="Jetzt synchronisieren" className="chip hover:border-white/25">
                <span className={ok ? "live-dot" : "h-2 w-2 rounded-full bg-loss"} />
                <span className="hidden sm:inline">
                  {syncing ? "Synchronisiere …" : ok ? `Live · ${me.lastSyncAt ? fmtAgo(me.lastSyncAt / 1000) : "…"}` : "Sync-Fehler"}
                </span>
              </button>
            )}
            {status?.demo && <span className="chip border-amber/40 text-amber">DEMO</span>}
            {status && status.players.length > 0 && (
              <div className="relative">
                <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 hover:border-white/25">
                  <Avatar src={me?.avatar} name={me?.name ?? "?"} size={30} ring="#ffffff22" />
                  <span className="max-w-[140px] truncate text-sm font-medium">{me?.name}</span>
                  <span className="text-muted">▾</span>
                </button>
                {open && (
                  <div className="surface absolute right-0 mt-2 w-64 overflow-hidden p-1.5 fade-up" onMouseLeave={() => setOpen(false)}>
                    {status.players.map((p) => (
                      <button key={p.accountId} onClick={() => { setAccount(p.accountId); setOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] ${p.accountId === account ? "bg-white/[0.06]" : ""}`}>
                        <Avatar src={p.avatar} name={p.name} size={28} ring="#ffffff22" />
                        <span className="truncate text-sm">{p.name}</span>
                      </button>
                    ))}
                    <a href="/?add=1" className="mt-1 flex items-center gap-2 rounded-lg border-t border-white/[0.06] px-2 py-2 text-sm text-amber hover:bg-white/[0.06]">＋ Account hinzufügen</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="pointer-events-none fixed right-4 top-20 z-40 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <a key={t.id} href={`/match/${t.matchId}?account=${t.account}`} onClick={() => dismissToast(t.id)}
            className="surface toast-in pointer-events-auto flex items-center gap-3 border-amber/40 p-3 hover:border-amber">
            <span className="live-dot" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Neues Match erkannt</span>
              <span className="block text-xs text-muted">#{t.matchId} · jetzt ansehen →</span>
            </span>
            <button onClick={(e) => { e.preventDefault(); dismissToast(t.id); }} className="text-muted hover:text-white">✕</button>
          </a>
        ))}
      </div>
    </>
  );
}
