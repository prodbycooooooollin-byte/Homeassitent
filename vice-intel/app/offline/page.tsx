import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="container-page flex max-w-md flex-col items-center py-24 text-center">
      <WifiOff className="h-10 w-10 text-fg-faint" />
      <h1 className="h-display mt-4 text-2xl">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-fg-muted">Pages you opened before still work. Search answers and Intel Scan need a connection.</p>
      <Link href="/saved" className="mt-6 rounded-xl bg-violet-500 px-5 py-2.5 font-semibold text-white">
        Open saved intel
      </Link>
    </div>
  );
}
