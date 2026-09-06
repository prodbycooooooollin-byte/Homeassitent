"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError, HelpText } from "@/components/ui/input";
import { useRoomState } from "@/lib/client/room-state-context";

export function EvidenceDialog({ open, onClose, progressId }: { open: boolean; onClose: () => void; progressId: string | null }) {
  const { code } = useRoomState();
  const [url, setUrl] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!progressId) return;
    if (!url && !comment) {
      setError("Bitte Link oder Kommentar angeben.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressId, url: url || undefined, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler beim Speichern.");
      setUrl("");
      setComment("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Beweis hinzufügen" description="Twitch-Clip, Screenshot-Link oder kurzer Kommentar zu diesem Sieg.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="evurl">Link (Clip/Screenshot)</Label>
          <Input id="evurl" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://clips.twitch.tv/…" />
        </div>
        <div>
          <Label htmlFor="evcomment">Kommentar</Label>
          <Textarea id="evcomment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          <HelpText>Mindestens eines von beidem ist erforderlich.</HelpText>
        </div>
        <FieldError>{error}</FieldError>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Speichern
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
