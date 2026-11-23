import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Entity } from "@/lib/content/schema";
import { getById, hrefFor } from "@/lib/content/repository";
import { KIND_META } from "@/lib/ui-meta";
import { Media } from "./Media";
import { KindBadge, StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/cn";

export function posterWord(e: Entity): string {
  switch (e.kind) {
    case "unlock":
      return e.category;
    case "easter-egg":
      return "Secret";
    case "money":
      return "Cash";
    case "location":
      return e.title.split(" ")[0];
    case "character":
      return e.title.split(" ")[0];
    default:
      return "Mission";
  }
}

function subtitle(e: Entity): string | undefined {
  switch (e.kind) {
    case "unlock":
      return e.howTo;
    case "mission":
      return e.startLocation;
    default:
      return undefined;
  }
}

export function EntityCard({ e, className, priority, variant = "default" }: { e: Entity; className?: string; priority?: boolean; variant?: "default" | "row" | "tall" }) {
  const loc = e.locationId ? getById(e.locationId) : undefined;
  if (variant === "row") {
    return (
      <Link href={hrefFor(e)} className={cn("group surface flex items-center gap-3 p-2.5 pr-4 transition hover:border-violet-500/30", className)}>
        <Media media={e.media[0]} className="h-16 w-20 shrink-0 rounded-xl" sizes="96px" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{e.title}</p>
          <p className="truncate text-sm text-fg-muted">{subtitle(e) ?? e.summary}</p>
        </div>
        <StatusBadge status={e.verification.status} size="sm" short />
      </Link>
    );
  }
  return (
    <Link
      href={hrefFor(e)}
      className={cn("group surface flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:border-violet-500/30 hover:shadow-glow-sm", className)}
    >
      <div className="relative">
        <Media media={e.media[0]} posterText={posterWord(e)} className={variant === "tall" ? "aspect-[4/5]" : "aspect-[16/10]"} priority={priority} sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-850 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <KindBadge label={e.kind === "unlock" ? capitalize(e.category) : KIND_META[e.kind].label} />
          <StatusBadge status={e.verification.status} short />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 pt-1">
        <h3 className="font-display text-[17px] font-semibold leading-snug">{e.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{subtitle(e) ?? e.summary}</p>
        {loc ? (
          <p className="mt-auto flex items-center gap-1 pt-3 text-xs text-fg-faint">
            <MapPin className="h-3.5 w-3.5" /> {loc.title}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}
