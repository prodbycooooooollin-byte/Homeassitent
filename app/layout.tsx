import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Craftboard",
    template: "%s · Craftboard",
  },
  description:
    "Der gemeinsame Treffpunkt für euren Minecraft-Server: Statistiken, Spieler, Weltkarte und Modpack an einem Ort.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0e0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
