import type { Metadata } from "next";
import { ScanLine } from "lucide-react";
import { ScanClient } from "@/components/scan/ScanClient";

export const metadata: Metadata = { title: "Intel Scan", description: "Identify vehicles, places, objectives and secrets from a GTA VI screenshot or photo." };

export default function ScanPage() {
  return (
    <div className="container-page pt-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-violet-300">
          <ScanLine className="h-6 w-6" />
        </span>
        <div>
          <p className="eyebrow text-violet-300/80">Module 01</p>
          <h1 className="h-display text-2xl sm:text-3xl">Intel Scan</h1>
        </div>
      </div>
      <ScanClient />
    </div>
  );
}
