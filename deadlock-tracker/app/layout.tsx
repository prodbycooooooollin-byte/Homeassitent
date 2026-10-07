import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deadlock Tracker",
  description: "Match-Tracking, Match Summaries und Performance-Rating für Deadlock",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen">
        <header className="border-b border-line bg-panel/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight">
              <span className="text-amber">Deadlock</span> Tracker
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
