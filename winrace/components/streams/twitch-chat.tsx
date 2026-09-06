"use client";

import { useEffect, useState } from "react";

export function TwitchChat({ login, className }: { login: string; className?: string }) {
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  if (!parent) return <div className={className} />;

  return (
    <iframe
      src={`https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout`}
      className={className}
      title={`Twitch-Chat von ${login}`}
    />
  );
}
