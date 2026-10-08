import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { TopBar } from "@/components/TopBar";
import { Aurora, RouteProgress } from "@/components/RouteEffects";
import { UpdateBanner } from "@/components/UpdateBanner";
import { DebriefHost } from "@/components/DebriefHost";

export const metadata: Metadata = {
  title: "Deadlock Tracker",
  description: "Match-Tracking, Match Summaries und Performance-Rating für Deadlock",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <Aurora />
          <RouteProgress />
          <TopBar />
          <main className="mx-auto max-w-[1560px] px-5 pb-14 pt-5">{children}</main>
          <UpdateBanner />
          <DebriefHost />
        </Providers>
      </body>
    </html>
  );
}
