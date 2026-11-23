"use client";
import { AlertTriangle } from "lucide-react";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-20 text-center">
      <AlertTriangle className="h-10 w-10 text-status-unverified" />
      <h1 className="h-display mt-4 text-2xl">Something went wrong</h1>
      <p className="mt-2 text-fg-muted">The page failed to load. It&apos;s not you — try again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-xl bg-violet-500 px-5 py-2.5 font-semibold text-white hover:bg-violet-400">
        Try again
      </button>
    </div>
  );
}
