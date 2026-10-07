package dev.vaultsync.mc;

import dev.vaultsync.core.SyncEngine;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;

/**
 * Meldung oben rechts mit Fortschrittsbalken: bleibt sichtbar, solange die Welt beim Verlassen gesichert wird,
 * und zeigt danach kurz das Ergebnis (grün = gesichert, rot = fehlgeschlagen).
 */
final class ProgressToast implements Toast {
    private static final int W = 200, H = 52, SHOW_RESULT_MS = 6000;
    private final SyncEngine engine;
    private volatile boolean finished, ok, cancelled;
    private volatile String result = "";
    private volatile long finishedAt;
    private Toast.Visibility visibility = Toast.Visibility.SHOW;

    ProgressToast(SyncEngine engine) { this.engine = engine; }

    boolean isRunning() { return !finished; }

    void finish(boolean ok, String text) { this.cancelled = text != null && text.startsWith("Abgebrochen"); this.ok = ok; this.result = text == null ? "" : text; this.finishedAt = System.currentTimeMillis(); this.finished = true; }

    @Override public Toast.Visibility getWantedVisibility() { return visibility; }

    @Override public void update(ToastManager manager, long time) {
        if (finished && System.currentTimeMillis() - finishedAt > SHOW_RESULT_MS) visibility = Toast.Visibility.HIDE;
    }

    @Override public int width() { return W; }
    @Override public int height() { return H; }

    @Override public void extractRenderState(GuiGraphicsExtractor g, Font font, long time) {
        int bg = 0xF01C1C1E;
        g.fill(1, 0, W - 1, H, bg); g.fill(0, 1, W, H - 1, bg);
        int accent = !finished ? 0xFF0A84FF : ok ? 0xFF30D158 : cancelled ? 0xFFFF9F0A : 0xFFFF453A;
        g.fill(0, 4, 2, H - 4, accent);

        String title = !finished ? "Vault sichert deine Welt" : ok ? "Welt gesichert" : cancelled ? "Sicherung abgebrochen" : "Sicherung fehlgeschlagen";
        g.text(font, title, 10, 6, 0xFFFFFFFF, false);

        double p = engine.progress();
        String sub;
        if (finished) sub = result;
        else {
            String phase = engine.phase().isEmpty() ? "Bitte warten" : engine.phase();
            sub = p > 0.005 ? phase + " " + (int) Math.round(p * 100) + " %" : phase + " …";
        }
        g.text(font, font.plainSubstrByWidth(sub, W - 20), 10, 18, finished && !ok && !cancelled ? 0xFFFF9A92 : 0x99EBEBF5, false);
        if (!finished) g.text(font, "Zum Abbrechen klicken", 10, 29, 0x66EBEBF5, false);

        // Fortschrittsbalken: ohne Messwert läuft ein Streifen hin und her
        int bx = 10, bw = W - 20, by = H - 8;
        g.fill(bx, by, bx + bw, by + 3, 0x33FFFFFF);
        if (finished) g.fill(bx, by, bx + bw, by + 3, accent);
        else if (p > 0.005) g.fill(bx, by, bx + (int) Math.round(bw * Math.min(1.0, p)), by + 3, accent);
        else {
            int seg = bw / 4, pos = (int) ((time / 6) % (2L * (bw - seg)));
            if (pos > bw - seg) pos = 2 * (bw - seg) - pos;
            g.fill(bx + pos, by, bx + pos + seg, by + 3, accent);
        }
    }
}
