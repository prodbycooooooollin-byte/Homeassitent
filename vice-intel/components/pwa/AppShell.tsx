"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "vice-intel:install-dismissed";

/** Registers the service worker and offers installation (Android prompt / iOS instructions). */
export function AppShell() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      /* ignore */
    }
    if (standalone || dismissed) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      setIos(true);
      const t = setTimeout(() => setShow(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!show || (!bip && !ios)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--nav-h)+max(12px,env(safe-area-inset-bottom))+10px)] z-40 animate-fade-up lg:bottom-6 lg:left-auto lg:right-6 lg:w-[360px]">
      <div className="glass flex items-start gap-3 rounded-2xl p-3.5 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install VICE INTEL</p>
          {ios ? (
            <p className="mt-0.5 text-xs text-fg-muted">
              Tap <Share className="inline h-3.5 w-3.5 -translate-y-px" /> Share, then <span className="text-fg">Add to Home Screen</span>. Opens full-screen like any app.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-fg-muted">Full-screen, on your home screen, works offline.</p>
          )}
          {bip ? (
            <button
              type="button"
              onClick={async () => {
                await bip.prompt();
                await bip.userChoice;
                dismiss();
              }}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" /> Install
            </button>
          ) : null}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1 text-fg-faint hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
