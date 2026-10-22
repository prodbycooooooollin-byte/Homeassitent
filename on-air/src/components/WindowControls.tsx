import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "../lib/api";
import { t } from "../lib/i18n";

/**
 * Eigene Fensterknöpfe statt der Windows-Standardleiste (Fenster ohne Systemrahmen).
 * Schließen löst dasselbe Ereignis aus wie der Systemknopf – also auch die Abfrage
 * „In den Tray oder beenden?“. Im Browser (Vorschau) wird nichts angezeigt.
 */
export function WindowControls({ maximizable = true }: { maximizable?: boolean }) {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      setMax(await w.isMaximized());
      un = await w.onResized(async () => setMax(await w.isMaximized()));
    });
    return () => un?.();
  }, []);
  if (!isTauri) return null;
  const win = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();
  return (
    <div className="winctl" role="group" aria-label={t("win.controls")}>
      <button className="winctl-btn" aria-label={t("win.minimize")} title={t("win.minimize")} onClick={async () => (await win()).minimize()}><Minus size={16} /></button>
      {maximizable && (
        <button className="winctl-btn" aria-label={max ? t("win.restore") : t("win.maximize")} title={max ? t("win.restore") : t("win.maximize")} onClick={async () => (await win()).toggleMaximize()}>
          {max ? <Copy size={14} style={{ transform: "scaleX(-1)" }} /> : <Square size={13} />}
        </button>
      )}
      <button className="winctl-btn close" aria-label={t("win.close")} title={t("win.close")} onClick={async () => (await win()).close()}><X size={17} /></button>
    </div>
  );
}
