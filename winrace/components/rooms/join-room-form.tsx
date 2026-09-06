"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, HelpText } from "@/components/ui/input";

export function JoinRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const normalizedCode = code.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${encodeURIComponent(normalizedCode)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Beitritt fehlgeschlagen.");
      router.push(`/rooms/${normalizedCode}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="code">Raumcode</Label>
            <Input
              id="code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WR-XXXXXX"
              className="font-mono uppercase tracking-wider"
            />
          </div>
          <div>
            <Label htmlFor="password">Raum-Passwort</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <HelpText>Einen Einladungslink erhalten? Öffne ihn direkt – Passwort ist dann nicht nötig.</HelpText>
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" loading={loading}>
            Beitreten
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
