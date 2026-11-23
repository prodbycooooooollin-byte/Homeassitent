import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsClient } from "@/components/pwa/SettingsClient";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <div className="container-page max-w-2xl pt-8">
      <h1 className="h-display text-3xl">Settings</h1>
      <Suspense>
        <SettingsClient />
      </Suspense>
    </div>
  );
}
