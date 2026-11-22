import type { ReactNode } from "react";
import { Media } from "./Media";
import type { ArtScene } from "@/lib/content/schema";

export function PageIntro({ title, eyebrow, children, scene, seed, icon }: { title: string; eyebrow?: string; children?: ReactNode; scene: ArtScene; seed: number; icon?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/[0.06]">
      <Media media={{ alt: "", art: { scene, seed } }} priority className="absolute inset-0 -z-10 h-full w-full opacity-60" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 via-ink-950/80 to-ink-950/30" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 to-transparent" />
      <div className="container-page py-8 sm:py-12">
        {eyebrow ? <p className="eyebrow text-violet-300/80">{eyebrow}</p> : null}
        <h1 className="h-display mt-2 flex items-center gap-3 text-3xl sm:text-5xl">
          {icon ? <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-violet-300 sm:h-14 sm:w-14">{icon}</span> : null}
          {title}
        </h1>
        {children ? <div className="mt-3 max-w-2xl text-fg-muted">{children}</div> : null}
      </div>
    </section>
  );
}
