"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Etwas ist schiefgelaufen.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Passwort zurücksetzen"
      subtitle="Wir senden dir einen Link zum Zurücksetzen deines Passworts."
      footer={
        <Link href="/login" className="font-medium text-brand hover:underline">
          Zurück zum Login
        </Link>
      }
    >
      {result ? (
        <div className="space-y-3 text-sm text-ink-muted">
          <p>{result.message}</p>
          {result.devResetUrl && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              <p className="font-medium text-warning">Entwicklungsmodus (kein SMTP konfiguriert):</p>
              <a href={result.devResetUrl} className="break-all text-brand underline">
                {result.devResetUrl}
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" loading={loading}>
            Link anfordern
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
