"use client";

import { useEffect, useState } from "react";

/**
 * Offizielles Twitch-Embed. Der `parent`-Parameter MUSS exakt dem Hostnamen
 * entsprechen, unter dem diese Seite eingebettet/aufgerufen wird – Twitch
 * lehnt den Embed sonst ab. Da WinRace unter beliebigen Domains laufen
 * kann, wird `location.hostname` zur Laufzeit im Browser gelesen statt
 * eine feste Domain zu hinterlegen.
 */
export function TwitchPlayer({ login, muted = false, autoplay = true, className }: { login: string; muted?: boolean; autoplay?: boolean; className?: string }) {
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  if (!parent) return <div className={className} />;

  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(login)}&parent=${encodeURIComponent(parent)}&muted=${muted}&autoplay=${autoplay}`;

  return (
    <iframe
      src={src}
      className={className}
      allowFullScreen
      title={`Twitch-Stream von ${login}`}
    />
  );
}
