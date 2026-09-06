import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Archive as ArchiveIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { listArchivedRooms } from "@/lib/server/archive";
import { SiteHeader } from "@/components/layout/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Archiv" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/archive");

  const rooms = await listArchivedRooms(user.id);

  return (
    <div>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="font-display text-2xl font-bold text-ink">Archiv</h1>
        <p className="mt-1 text-ink-faint">Vergangene Challenges, an denen du beteiligt warst.</p>

        <div className="mt-8">
          {rooms.length === 0 ? (
            <EmptyState icon={<ArchiveIcon className="h-8 w-8" />} title="Noch keine archivierten Challenges" description="Beendete Räume erscheinen hier, sobald der Host sie archiviert." />
          ) : (
            <div className="space-y-3">
              {rooms.map((r) => (
                <Link key={r.code} href={`/rooms/${r.code}/live`}>
                  <Card className="transition-colors hover:bg-base-card-hover">
                    <CardContent className="flex items-center justify-between gap-4 pt-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} src={r.logoUrl} />
                        <div>
                          <p className="font-medium text-ink">{r.name}</p>
                          <p className="text-xs text-ink-faint">{formatDateTime(new Date(r.endedAt))}</p>
                        </div>
                      </div>
                      {r.winnerName ? (
                        <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: r.winnerColor ?? undefined }}>
                          <Trophy className="h-4 w-4" /> {r.winnerName}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-faint">Kein Sieger festgehalten</span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
