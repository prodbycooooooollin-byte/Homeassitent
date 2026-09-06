"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, HelpText } from "@/components/ui/input";

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registrierung fehlgeschlagen.");

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("Konto erstellt, Anmeldung fehlgeschlagen. Bitte manuell einloggen.");

      router.push("/rooms/join");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="displayName">Anzeigename</Label>
        <Input id="displayName" required minLength={2} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <HelpText>Mindestens 8 Zeichen.</HelpText>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" loading={loading}>
        Konto erstellen
      </Button>
    </form>
  );
}
