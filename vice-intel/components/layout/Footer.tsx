import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/[0.06] pb-safe-nav lg:pb-10">
      <div className="container-page grid gap-8 py-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-fg-muted">Find anything. Understand everything. Get back to playing.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2 text-sm text-fg-muted">
          <Link className="hover:text-fg" href="/missions">Missions</Link>
          <Link className="hover:text-fg" href="/unlocks">Unlocks</Link>
          <Link className="hover:text-fg" href="/easter-eggs">Easter Eggs</Link>
          <Link className="hover:text-fg" href="/money">Money Intel</Link>
          <Link className="hover:text-fg" href="/map">Map</Link>
          <Link className="hover:text-fg" href="/scan">Intel Scan</Link>
          <Link className="hover:text-fg" href="/about">Sources &amp; trust</Link>
          <Link className="hover:text-fg" href="/settings">Settings</Link>
          <Link className="hover:text-fg" href="/admin">Content desk</Link>
        </nav>
        <p className="text-xs leading-relaxed text-fg-faint">
          VICE INTEL is an unofficial fan project and is not affiliated with, endorsed or sponsored by Rockstar Games or Take-Two Interactive.
          Grand Theft Auto, GTA and related marks are trademarks of Take-Two Interactive Software, Inc. Illustrations on this site are original artwork, not game screenshots.
        </p>
      </div>
    </footer>
  );
}
