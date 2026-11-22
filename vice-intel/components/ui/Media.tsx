import Image from "next/image";
import type { Media as MediaT } from "@/lib/content/schema";
import { artUrl } from "@/lib/ui-meta";
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
}: {
  media: Pick<MediaT, "alt" | "src" | "art" | "focal" | "width" | "height"> & { fit?: MediaT["fit"]; authenticGameplay?: boolean };
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Show a small "Illustration" marker so art is never mistaken for a screenshot. */
  label?: boolean;
}) {
  const pos = media.focal ? `${media.focal.x * 100}% ${media.focal.y * 100}%` : "50% 50%";
  return (
    <div
      className={cn(
        className?.includes("absolute") ? "" : "relative",
        "overflow-hidden",
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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artUrl(media.art.scene, media.art.seed)}
          alt={media.alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className="zoom-on-hover absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: pos }}
        />
      ) : null}
      {label && !media.authenticGameplay ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur">
          {media.src ? "Concept art" : "Illustration"}
        </span>
      ) : null}
    </div>
  );
}
