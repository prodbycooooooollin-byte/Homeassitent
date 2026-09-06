"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function InviteJoinButton({ token, code }: { token: string; code: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return (
      <Button className="w-full" onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`)}>
        Anmelden, um beizutreten
      </Button>
    );
  }

  async function handleJoin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, inviteToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Beitritt fehlgeschlagen.");
      router.push(`/rooms/${code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={handleJoin} loading={loading}>
        Diesem Raum beitreten
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
