import Image from "next/image";
import type { Media as MediaT } from "@/lib/content/schema";
import { Poster } from "./Poster";
import { cn } from "@/lib/cn";

/**
 * Renders a record's media with consistent cropping and lazy loading.
 * Licensed images go through next/image (responsive AVIF/WebP); original
 * illustrations come from the /art route as cacheable SVG.
 */
export function Media({
  media,
  className,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority = false,
  label = false,
  posterText,
}: {
  media: Pick<MediaT, "alt" | "src" | "art" | "focal" | "width" | "height"> & { fit?: MediaT["fit"]; authenticGameplay?: boolean };
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Show a small "Illustration" marker so art is never mistaken for a screenshot. */
  label?: boolean;
  /** Oversized word on the typographic poster shown when no image exists. */
  posterText?: string;
}) {
  const pos = media.focal ? `${media.focal.x * 100}% ${media.focal.y * 100}%` : "50% 50%";
  return (
    <div
      className={cn(
        className?.includes("absolute") ? "" : "relative",
        "overflow-hidden [container-type:inline-size]",
        media.fit === "contain"
          ? "bg-[radial-gradient(70%_60%_at_50%_45%,rgb(var(--violet-600)/0.35),transparent_70%),linear-gradient(180deg,rgb(var(--ink-800)),rgb(var(--ink-950)))]"
          : "bg-gradient-to-br from-violet-900/60 via-ink-800 to-ink-900",
        className,
      )}
    >
      {media.src ? (
        <Image
          src={media.src}
          alt={media.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn("zoom-on-hover", media.fit === "contain" ? "object-contain p-[8%] drop-shadow-[0_18px_24px_rgba(0,0,0,0.65)]" : "object-cover")}
          style={{ objectPosition: pos }}
        />
      ) : media.art ? (
        <Poster scene={media.art.scene} seed={media.art.seed} text={posterText} />
      ) : null}
      {label && media.src && !media.authenticGameplay ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur">
          Concept art
        </span>
      ) : null}
    </div>
  );
}
