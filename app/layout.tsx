import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/lib/state/toast-context";
import { AppProvider } from "@/lib/state/app-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ToastViewport } from "@/components/ui/toast-viewport";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { ThemeEffect } from "@/components/settings/theme-effect";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Smart-Home-Center",
  description: "Zentrale Oberfläche zur Überwachung und Steuerung deines Zuhauses.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Smart-Home",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05070d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>
        <ToastProvider>
          <AppProvider>
            <ThemeEffect />
            <div className="min-h-screen">
              <Sidebar />
              <div className="flex min-h-screen flex-col lg:pl-64">
                <ConnectionBanner />
                <main className="flex-1 pb-24 lg:pb-8">
                  <div className="mx-auto w-full max-w-[1600px] px-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pt-8">
                    {children}
                  </div>
                </main>
              </div>
              <MobileNav />
            </div>
            <ToastViewport />
          </AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
