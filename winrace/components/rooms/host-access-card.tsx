"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-context";
import { useRoomState } from "@/lib/client/room-state-context";
import { useOrigin } from "@/lib/hooks/use-origin";
import { Ban, Plus, Ticket } from "lucide-react";

interface Invite {
  id: string;
  label: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
}

export function HostAccessCard() {
  const { state, code } = useRoomState();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const siteUrl = useOrigin();

  async function loadInvites() {
    const res = await fetch(`/api/rooms/${code}/invites`);
    if (res.ok) setInvites((await res.json()).invites);
  }

  useEffect(() => {
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function createInvite() {
    setCreating(true);
    try {
      const res = await fetch(`/api/rooms/${code}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined, maxUses: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Konnte Einladung nicht erstellen.");
      setLatestLink(data.inviteUrl);
      setLabel("");
      await loadInvites();
    } catch (err) {
      toast.push({ variant: "error", title: "Fehler", description: err instanceof Error ? err.message : undefined });
    } finally {
      setCreating(false);
    }
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/rooms/${code}/invites/${id}`, { method: "DELETE" });
    await loadInvites();
  }

  const spectatorUrl = `${siteUrl}/rooms/${code}/live`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raum-Zugänge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-base-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Raumcode</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold text-ink">{state.room.code}</span>
              <CopyButton value={state.room.code} />
            </div>
          </div>
          {state.room.visibility === "PUBLIC" && (
            <div className="space-y-2 rounded-xl border border-base-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Zuschauer-Link</p>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-ink-muted">{spectatorUrl}</span>
                <CopyButton value={spectatorUrl} />
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Einladungslinks</p>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Label (optional), z.B. 'Team A Spieler'" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={createInvite} loading={creating}>
              <Plus className="h-4 w-4" /> Erstellen
            </Button>
          </div>

          {latestLink && (
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-brand/30 bg-brand/10 p-4">
              <QrCode value={latestLink} size={96} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-faint">Neuer Einladungslink (einmalig anzeigbar):</p>
                <p className="truncate text-sm text-ink">{latestLink}</p>
                <CopyButton value={latestLink} className="mt-2" />
              </div>
            </div>
          )}

          <ul className="mt-3 divide-y divide-base-border">
            {invites.map((inv) => {
              const exhausted = inv.useCount >= inv.maxUses;
              const expired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
              const inactive = Boolean(inv.revokedAt) || exhausted || expired;
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-ink-faint" />
                    <span className="text-ink">{inv.label || "Ohne Label"}</span>
                    <Badge className={inactive ? "bg-ink-faint/20 text-ink-faint" : "bg-success/15 text-success"}>
                      {inv.revokedAt ? "Widerrufen" : exhausted ? "Aufgebraucht" : expired ? "Abgelaufen" : "Aktiv"}
                    </Badge>
                    <span className="text-xs text-ink-faint">
                      {inv.useCount}/{inv.maxUses} genutzt
                    </span>
                  </div>
                  {!inactive && (
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite(inv.id)}>
                      <Ban className="h-3.5 w-3.5" /> Widerrufen
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
