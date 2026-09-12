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
 * mc-heads.net-Dienst (per UUID oder Name); schlägt der Abruf fehl (z. B.
 * offline, oder ein frei erfundener Demo-Name), wird auf einen generierten
 * Initialen-Avatar zurückgefallen statt kaputte Bilder zu zeigen.
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
  const [failed, setFailed] = useState(false);
  const identifier = uuid || username;
  const src = `https://mc-heads.net/avatar/${encodeURIComponent(identifier)}/${Math.min(
    size * 2,
    200,
  )}`;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {failed ? (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center font-semibold text-white",
            rounded ? "rounded-md" : "",
          )}
          style={{
            background: `hsl(${hashHue(username)}, 45%, 32%)`,
            fontSize: size * 0.4,
          }}
        >
          {username.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={username}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover", rounded ? "rounded-md" : "")}
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
