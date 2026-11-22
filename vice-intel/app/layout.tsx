import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "VICE INTEL — GTA VI companion", template: "%s · VICE INTEL" },
  description:
    "Unofficial GTA VI companion: search missions, unlocks, Easter eggs and money-making intel, or scan a screenshot. Every fact is labelled with how much you can trust it.",
  applicationName: "VICE INTEL",
  openGraph: { type: "website", siteName: "VICE INTEL" },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#06050a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-violet-500 focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <DemoBanner />
        <SiteHeader />
        <main id="main" className="min-h-[70vh]">
          {children}
        </main>
        <Footer />
        <MobileNav />
        <CommandPalette />
      </body>
    </html>
  );
}
