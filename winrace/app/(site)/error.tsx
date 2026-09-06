"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-grid px-4 text-center">
      <TriangleAlert className="h-12 w-12 text-danger" />
      <h1 className="font-display text-2xl font-bold text-ink">Etwas ist schiefgelaufen</h1>
      <p className="max-w-sm text-ink-faint">Ein unerwarteter Fehler ist aufgetreten. Du kannst es erneut versuchen.</p>
      <Button onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
