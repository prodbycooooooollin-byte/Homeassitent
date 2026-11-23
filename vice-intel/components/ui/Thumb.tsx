import type { ArtScene } from "@/lib/content/schema";
import { Poster } from "./Poster";
import { cn } from "@/lib/cn";

/** Small thumbnail: the real image if there is one, otherwise a mini poster. */
export function Thumb({ src, art, alt = "", className, contain }: { src?: string; art?: { scene: string; seed: number }; alt?: string; className?: string; contain?: boolean }) {
  return (
    <span className={cn("relative block overflow-hidden bg-ink-800", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("zoom-on-hover h-full w-full", contain ? "object-contain p-1" : "object-cover")} />
      ) : art ? (
        <Poster scene={art.scene as ArtScene} seed={art.seed} />
      ) : null}
    </span>
  );
}
