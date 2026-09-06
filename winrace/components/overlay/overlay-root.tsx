import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { OverlayConfigInput } from "@/lib/validation";

const FONT_PX: Record<string, number> = { sm: 15, md: 19, lg: 24, xl: 30 };

const POSITION_CLASSES: Record<string, string> = {
  top: "items-start justify-center pt-10",
  bottom: "items-end justify-center pb-10",
  left: "items-center justify-start pl-10",
  right: "items-center justify-end pr-10",
  center: "items-center justify-center",
};

/**
 * Gemeinsame Hülle aller OBS-Overlays: transparenter Hintergrund (bzw. vom
 * Host konfigurierte Deckkraft), Schriftgröße über `config.fontSize`
 * (nachgelagerte Overlay-Komponenten nutzen `em`-Einheiten, damit sich
 * alles relativ zu dieser Basisgröße skaliert), Ausrichtung im 1920×1080-
 * Referenzrahmen und optionale Reduced-Motion-Rücksicht (global in
 * globals.css verankert).
 */
export function OverlayRoot({ config, children }: { config: OverlayConfigInput; children: ReactNode }) {
  return (
    <div
      className={cn("flex min-h-dvh w-full p-6", POSITION_CLASSES[config.position] ?? POSITION_CLASSES.top)}
      style={{
        fontSize: FONT_PX[config.fontSize] ?? FONT_PX.md,
        background: config.backgroundOpacity > 0 ? `rgba(5,5,9,${config.backgroundOpacity / 100})` : "transparent",
      }}
    >
      {children}
    </div>
  );
}
