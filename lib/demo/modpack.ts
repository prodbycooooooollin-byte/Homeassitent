import type { ModpackView } from "@/lib/queries/modpack";

export function getDemoModpackData(): ModpackView {
  return {
    id: "demo",
    name: "Blockfreunde Modpack",
    description:
      "Performance- und Qualitäts-Mods für unser SMP: Sodium, Lithium, bessere Baumkronen und ein paar Deko-Mods.",
    iconUrl: null,
    current: {
      id: "demo-v3.2.1",
      versionNumber: "3.2.1",
      minecraftVersion: "1.20.1",
      loader: "fabric",
      changelog: "- Sodium auf 0.5.8 aktualisiert\n- Fehler beim Farmen-Rendering behoben",
      isCurrent: true,
      source: "UPLOAD",
      fileSizeBytes: 18_874_368,
      releasedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      modList: [
        { name: "sodium", fileName: "sodium-fabric-0.5.8.jar" },
        { name: "lithium", fileName: "lithium-fabric-0.12.1.jar" },
        { name: "iris", fileName: "iris-1.7.0.jar" },
        { name: "fabric api", fileName: "fabric-api-0.92.0.jar" },
        { name: "bobby", fileName: "bobby-5.2.1.jar" },
      ],
    },
    olderVersions: [
      {
        id: "demo-v3.1.0",
        versionNumber: "3.1.0",
        minecraftVersion: "1.20.1",
        loader: "fabric",
        changelog: "- Erste Season-3-Version",
        isCurrent: false,
        source: "UPLOAD",
        fileSizeBytes: 18_200_000,
        releasedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        modList: null,
      },
    ],
  };
}
