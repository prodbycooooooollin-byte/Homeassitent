import Link from "next/link";
import { Compass } from "lucide-react";
import { HeroSearch } from "@/components/search/HeroSearch";

export default function NotFound() {
  return (
    <div className="container-page flex max-w-2xl flex-col items-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-violet-300">
        <Compass className="h-7 w-7" />
      </div>
      <h1 className="h-display mt-4 text-3xl">Off the map</h1>
      <p className="mt-2 text-fg-muted">This page doesn&apos;t exist (or the intel was moved). Try a search instead.</p>
      <HeroSearch className="mt-6 w-full text-left" />
      <Link href="/" className="link-underline mt-6 text-sm text-violet-300">Back to home</Link>
    </div>
  );
}
