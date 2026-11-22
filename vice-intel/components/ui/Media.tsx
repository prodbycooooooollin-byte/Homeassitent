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
  media: Pick<MediaT, "alt" | "src" | "art" | "focal" | "width" | "height">;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Show a small "Illustration" marker so art is never mistaken for a screenshot. */
  label?: boolean;
}) {
  const pos = media.focal ? `${media.focal.x * 100}% ${media.focal.y * 100}%` : "50% 50%";
  return (
    <div className={cn(className?.includes("absolute") ? "" : "relative", "overflow-hidden bg-gradient-to-br from-violet-900/60 via-ink-800 to-ink-900", className)}>
      {media.src ? (
        <Image
          src={media.src}
          alt={media.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="zoom-on-hover object-cover"
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
      {label && media.art && !media.src ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur">
          Illustration
        </span>
      ) : null}
    </div>
  );
}
