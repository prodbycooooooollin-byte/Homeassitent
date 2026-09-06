import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { CreateRoomForm } from "@/components/rooms/create-room-form";

export const metadata: Metadata = { title: "Raum erstellen" };

export default async function NewRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/rooms/new");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Neuen Challenge-Raum erstellen</h1>
      <p className="mt-2 text-ink-faint">Du wirst automatisch Host dieses Raums und kannst danach Spiele, Teams und Overlays konfigurieren.</p>
      <div className="mt-8">
        <CreateRoomForm />
      </div>
    </div>
  );
}
