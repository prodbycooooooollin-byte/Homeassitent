import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "WinRace Overlay",
  robots: { index: false, follow: false },
};

/**
 * Eigenes Root-Layout (Next.js unterstützt mehrere Root-Layouts über Route-
 * Groups) speziell für OBS-Browserquellen: transparenter Hintergrund statt
 * des dunklen Seiten-Hintergrunds, kein Auth-/Toast-Provider nötig.
 */
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${rajdhani.variable}`}>
      <body className="min-h-dvh bg-transparent font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
