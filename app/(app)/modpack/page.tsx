import { Package } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveDemoMode } from "@/lib/server-context";
import { getModpackData } from "@/lib/queries/modpack";
import { getDemoModpackData } from "@/lib/demo/modpack";
import { DemoModeBanner } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CurrentVersionCard } from "@/components/modpack/current-version-card";
import { ModList } from "@/components/modpack/mod-list";
import { VersionHistory } from "@/components/modpack/version-history";
import { AdminModpackPanel } from "@/components/modpack/admin-modpack-panel";

export const metadata = { title: "Modpack" };

export default async function ModpackPage() {
  const user = await requireUser();
  const { demoMode, server } = await resolveDemoMode();

  const modpack =
    demoMode || !server ? getDemoModpackData() : await getModpackData(server.id);

  return (
    <div className="space-y-5">
      {demoMode && <DemoModeBanner />}

      {modpack ? (
        <>
          <div className="flex items-center gap-3">
            {modpack.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={modpack.iconUrl}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-lg border border-line object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-faint">
                <Package size={22} />
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-ink">{modpack.name}</h1>
              {modpack.description && <p className="text-sm text-ink-muted">{modpack.description}</p>}
            </div>
          </div>

          <CurrentVersionCard version={modpack.current} demoMode={demoMode} />
          <ModList mods={modpack.current?.modList ?? null} />
          <VersionHistory versions={modpack.olderVersions} demoMode={demoMode} />
        </>
      ) : (
        <EmptyState
          icon={Package}
          title="Noch kein Modpack hinterlegt"
          description="Ein Admin kann unten eine .mrpack-Datei hochladen oder eine Modrinth-Version verknüpfen."
        />
      )}

      {user.role === "ADMIN" && !demoMode && (
        <AdminModpackPanel
          modpackName={modpack?.name ?? "Modpack"}
          allVersions={modpack ? [...(modpack.current ? [modpack.current] : []), ...modpack.olderVersions] : []}
        />
      )}
    </div>
  );
}
