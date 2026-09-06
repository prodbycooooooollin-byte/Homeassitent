import type { Metadata, Viewport } from "next";
import { Inter, Rajdhani } from "next/font/google";
import "../globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "WinRace – Live Twitch-Team-Challenges", template: "%s · WinRace" },
  description: "WinRace ist die Echtzeit-Plattform für Twitch-Team-Challenges: zwei Teams, eine Spieleliste, ein Sieger.",
};

export const viewport: Viewport = {
  themeColor: "#050509",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`site-shell ${inter.variable} ${rajdhani.variable}`}>
      <body className="site-shell min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
