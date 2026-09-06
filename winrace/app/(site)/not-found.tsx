import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-grid px-4 text-center">
      <Compass className="h-12 w-12 text-ink-faint" />
      <h1 className="font-display text-4xl font-extrabold text-ink">404</h1>
      <p className="max-w-sm text-ink-faint">Diese Seite gibt es nicht – oder der Raum wurde noch nicht erstellt. Prüfe den Link oder Raumcode.</p>
      <Link href="/">
        <Button>Zur Startseite</Button>
      </Link>
    </div>
  );
}
