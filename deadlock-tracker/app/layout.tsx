import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Deadlock Tracker",
  description: "Match-Tracking, Match Summaries und Performance-Rating für Deadlock",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <TopBar />
          <main className="mx-auto max-w-[1280px] px-5 pb-16 pt-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
