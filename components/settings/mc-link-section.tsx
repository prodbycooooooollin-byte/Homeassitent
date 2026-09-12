"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Copy, Check, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { generateLinkCodeAction, unlinkMinecraftAccountAction } from "@/lib/actions/mc-link";
import { formatDateTime } from "@/lib/format";

export function McLinkSection({
  account,
}: {
  account: { uuid: string; username: string; linkedAt: Date } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solange ein Code offen ist, regelmäßig aktualisieren - sobald der Agent
  // die Verknüpfung bestätigt, verschwindet der Code-Block automatisch
  // (Server Component liefert dann `account`).
  useEffect(() => {
    if (!code || !expiresAt) return;
    if (Date.now() > expiresAt.getTime()) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [code, expiresAt, router]);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateLinkCodeAction();
        setCode(result.code);
        setExpiresAt(new Date(result.expiresAt));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Erzeugen des Codes.");
      }
    });
  }

  function handleCopy() {
    if (!code) return;
    navigator.clipboard?.writeText(`!link ${code}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Minecraft-Account verknüpfen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {account ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <PlayerAvatar uuid={account.uuid} username={account.username} size={40} />
              <div>
                <p className="text-sm font-medium text-ink">{account.username}</p>
                <p className="text-xs text-ink-muted">
                  Verknüpft seit {formatDateTime(account.linkedAt)}
                </p>
              </div>
            </div>
            <form action={unlinkMinecraftAccountAction}>
              <Button type="submit" variant="danger" size="sm">
                Verknüpfung aufheben
              </Button>
            </form>
          </div>
        ) : code ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Schreibe diesen Befehl im Chat auf dem Minecraft-Server, um dein Konto zu
              bestätigen:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-center font-mono text-lg tracking-widest text-accent">
                !link {code}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
              Gültig bis {expiresAt && formatDateTime(expiresAt)} - diese Seite aktualisiert
              sich automatisch, sobald der Connector die Verknüpfung bestätigt hat.
            </p>
            <p className="text-xs text-ink-faint">
              Voraussetzung: Der Connector-Agent des Servers muss laufen und den Chat
              beobachten (siehe Einrichtung unten).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              Noch kein Minecraft-Account verknüpft. Ein frei eingegebener Name reicht nicht
              als Nachweis - bestätige deinen Account per Ingame-Code.
            </p>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="button" onClick={handleGenerate} disabled={pending} size="sm">
              <Link2 size={14} /> Code generieren
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
