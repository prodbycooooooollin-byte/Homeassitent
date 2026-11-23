import type { Metadata } from "next";
import { SavedList } from "@/components/lists/SavedList";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default function SavedPage() {
  return (
    <div className="container-page pt-6">
      <h1 className="h-display text-3xl">Saved</h1>
      <p className="mt-1 text-sm text-fg-muted">Bookmarks live on this device only — no account needed.</p>
      <SavedList />
    </div>
  );
}
