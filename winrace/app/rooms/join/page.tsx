import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { JoinRoomForm } from "@/components/rooms/join-room-form";

export const metadata: Metadata = { title: "Raum beitreten" };

export default async function JoinRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/rooms/join");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-2xl font-bold text-ink">Raum beitreten</h1>
      <p className="mt-2 text-ink-faint">Gib den Raumcode und das Passwort ein, das dir der Host mitgeteilt hat.</p>
      <div className="mt-8">
        <Suspense>
          <JoinRoomForm />
        </Suspense>
      </div>
    </div>
  );
}
