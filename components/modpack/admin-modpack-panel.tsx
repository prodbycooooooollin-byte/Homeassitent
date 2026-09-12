"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Link2, Star, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  saveModpackInfoAction,
  uploadModpackVersionAction,
  linkModrinthVersionAction,
  setCurrentVersionAction,
  deleteModpackVersionAction,
} from "@/lib/actions/modpack";
import type { ModpackVersionView } from "@/lib/queries/modpack";

const inputClass =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function AdminModpackPanel({
  modpackName,
  allVersions,
}: {
  modpackName: string;
  allVersions: ModpackVersionView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"upload" | "modrinth" | "manage">(allVersions.length ? "manage" : "upload");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? { text: "Gespeichert." } : { text: result.error ?? "Fehler.", error: true });
      router.refresh();
    });
  }

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <CardTitle>Modpack verwalten (Admin)</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex gap-1.5 border-b border-line pb-3">
          {(
            [
              ["upload", "Hochladen"],
              ["modrinth", "Modrinth verknüpfen"],
              ["manage", "Versionen"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tab === key ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-raised"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <p className={`text-xs ${message.error ? "text-danger" : "text-accent"}`}>{message.text}</p>
        )}

        {tab === "upload" && (
          <form
            action={(fd) => runAction(() => uploadModpackVersionAction(fd))}
            className="space-y-3"
          >
            <input type="hidden" name="modpackName" value={modpackName} />
            <div className="grid grid-cols-3 gap-3">
              <input name="versionNumber" placeholder="Version, z. B. 3.2.1" required className={inputClass} />
              <input name="minecraftVersion" placeholder="MC-Version, z. B. 1.20.1" required className={inputClass} />
              <input name="loader" placeholder="Loader, z. B. fabric" required className={inputClass} />
            </div>
            <textarea name="changelog" placeholder="Änderungsprotokoll (optional)" rows={3} className={inputClass} />
            <input type="file" name="file" accept=".mrpack" required className={inputClass} />
            <Button type="submit" disabled={pending} size="sm">
              <Upload size={14} /> Hochladen
            </Button>
          </form>
        )}

        {tab === "modrinth" && (
          <form action={(fd) => runAction(() => linkModrinthVersionAction(fd))} className="space-y-3">
            <input
              name="versionInput"
              placeholder="Modrinth-Versions-URL oder -ID"
              required
              className={inputClass}
            />
            <p className="text-xs text-ink-faint">
              Auf der Modrinth-Projektseite die gewünschte Version öffnen und die URL aus der
              Adressleiste einfügen.
            </p>
            <Button type="submit" disabled={pending} size="sm">
              <Link2 size={14} /> Verknüpfen
            </Button>
          </form>
        )}

        {tab === "manage" && (
          <div className="space-y-2">
            {allVersions.length === 0 && (
              <p className="text-sm text-ink-muted">Noch keine Version hochgeladen oder verknüpft.</p>
            )}
            {allVersions.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {v.isCurrent && <Badge tone="accent">Freigegeben</Badge>}
                  <span className="text-sm text-ink">
                    v{v.versionNumber} · {v.minecraftVersion}/{v.loader}
                  </span>
                  <Badge tone="neutral">{v.source === "MODRINTH" ? "Modrinth" : "Upload"}</Badge>
                </div>
                <div className="flex gap-1.5">
                  {!v.isCurrent && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => runAction(() => setCurrentVersionAction(v.id))}
                    >
                      <Star size={13} /> Freigeben
                    </Button>
                  )}
                  {!v.isCurrent && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() => runAction(() => deleteModpackVersionAction(v.id))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
