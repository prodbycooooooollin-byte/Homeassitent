import Link from "next/link";
import { Swords, Users, Gamepad2, Radio, MonitorPlay, Tv, ArrowRight, FlaskConical } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  { icon: Users, title: "Teams & Rollen", text: "Host, Team-Leads, Mitglieder und Zuschauer mit klar getrennten Rechten – serverseitig durchgesetzt." },
  { icon: Gamepad2, title: "Challenge-Konfiguration", text: "Beliebige Spiele mit Zielsiegen, Regeln, Schwierigkeit und Reihenfolge – per Drag-and-drop sortiert." },
  { icon: Radio, title: "Echtzeit-Fortschritt", text: "Jede Änderung erscheint sofort bei allen – ohne Neuladen, mit atomaren Updates gegen Race-Conditions." },
  { icon: MonitorPlay, title: "OBS-Overlays", text: "Sieben eigenständige, transparente Overlay-Varianten mit eigenem Konfigurator und Live-Vorschau." },
  { icon: Tv, title: "Stream-Zentrale", text: "Bis zu acht Twitch-Streams im responsiven Grid, mit Chat, Theatermodus und Team-Filtern." },
  { icon: Swords, title: "Sicherer Beitritt", text: "Raumcode plus Passwort oder Einladungslink – nie durch Erraten der Raum-ID." },
];

export default function LandingPage() {
  return (
    <div className="bg-grid">
      <SiteHeader />

      <section className="relative overflow-hidden px-4 py-20 text-center sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-base-border-strong bg-base-card px-3 py-1 text-xs font-medium text-ink-muted">
            <Radio className="h-3 w-3 text-success" /> Live-Fortschritt in Echtzeit
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight text-ink sm:text-6xl">
            Zwei Teams. <span className="text-gradient-brand">Eine Spieleliste.</span> Ein Sieger.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-faint">
            WinRace ist die Echtzeit-Plattform für Twitch-Team-Challenges: Spiele konfigurieren, Fortschritt live verfolgen,
            als OBS-Overlay auf dem Stream zeigen.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/rooms/new">
              <Button size="lg">
                Raum erstellen <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/rooms/join">
              <Button size="lg" variant="secondary">
                Raum beitreten
              </Button>
            </Link>
          </div>
          <Link href="/demo" className="mt-4 inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink hover:underline">
            <FlaskConical className="h-3.5 w-3.5" /> Oder erst die Demo ansehen
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="pt-5">
                <f.icon className="h-6 w-6 text-brand" />
                <h3 className="mt-3 font-display font-semibold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-faint">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-base-border px-4 py-8 text-center text-xs text-ink-faint sm:px-8">
        WinRace – gebaut für Community-Events und Twitch-Team-Challenges.
      </footer>
    </div>
  );
}
