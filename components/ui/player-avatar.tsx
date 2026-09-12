"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { LiveDot } from "@/components/ui/badge";

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/**
 * Minecraft-Spielerkopf. Rendert den echten Kopf über den öffentlichen
 * mc-heads.net-Dienst (per UUID oder Name). Der Initialen-Platzhalter liegt
 * IMMER als Basisebene darunter und bleibt sichtbar, bis das Bild
 * tatsächlich geladen ist - so blitzt bei langsamem/fehlendem Laden nie ein
 * kaputtes Bildsymbol auf (z. B. Demo-Namen ohne echten Skin, oder wenn der
 * Avatar-Dienst blockiert/nicht erreichbar ist).
 */
export function PlayerAvatar({
  uuid,
  username,
  size = 40,
  online,
  className,
  rounded = true,
}: {
  uuid?: string | null;
  username: string;
  size?: number;
  online?: boolean;
  className?: string;
  rounded?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const identifier = uuid || username;
  const src = `https://mc-heads.net/avatar/${encodeURIComponent(identifier)}/${Math.min(
    size * 2,
    200,
  )}`;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className={cn(
          "flex h-full w-full items-center justify-center font-semibold text-white",
          rounded ? "rounded-md" : "",
        )}
        style={{ background: `hsl(${hashHue(username)}, 45%, 32%)`, fontSize: size * 0.4 }}
      >
        {username.slice(0, 2).toUpperCase()}
      </div>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={username}
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity",
            loaded ? "opacity-100" : "opacity-0",
            rounded ? "rounded-md" : "",
          )}
          style={{ imageRendering: "pixelated" }}
        />
      )}
      {online !== undefined && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-base p-[3px]">
          <LiveDot online={online} />
        </span>
      )}
    </div>
  );
}
