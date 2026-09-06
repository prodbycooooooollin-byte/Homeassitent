"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, HelpText } from "@/components/ui/input";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Etwas ist schiefgelaufen.");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Neues Passwort festlegen">
      {done ? (
        <p className="text-sm text-success">Passwort geändert. Du wirst zum Login weitergeleitet …</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="password">Neues Passwort</Label>
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <HelpText>Mindestens 8 Zeichen.</HelpText>
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" loading={loading}>
            Passwort speichern
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
