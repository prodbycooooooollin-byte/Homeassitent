"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

export function LoginForm({ twitchEnabled }: { twitchEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/rooms/join";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("E-Mail oder Passwort ist falsch.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">E-Mail-Adresse</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Passwort</Label>
            <a href="/forgot-password" className="mb-1.5 text-xs font-medium text-brand hover:underline">
              Vergessen?
            </a>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" loading={loading}>
          Anmelden
        </Button>
      </form>

      {twitchEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-faint">
            <div className="h-px flex-1 bg-base-border" />
            oder
            <div className="h-px flex-1 bg-base-border" />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={() => signIn("twitch", { callbackUrl })}>
            <Tv className="h-4 w-4 text-[#9146FF]" />
            Mit Twitch anmelden
          </Button>
        </>
      )}
    </div>
  );
}
