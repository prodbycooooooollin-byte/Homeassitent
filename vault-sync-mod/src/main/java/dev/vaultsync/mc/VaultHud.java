package dev.vaultsync.mc;

import dev.vaultsync.core.SyncEngine;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * Minimalistischer Statusindikator oben rechts: dünner, rotierender Bogen mit auslaufendem Schweif,
 * danach ein Häkchen (grün) bzw. ein Kreuz (rot). Gezeichnet in Halb-Pixel-Auflösung, ohne Texturen.
 */
final class VaultHud implements HudElement {
    private static final int FADE_MS = 400, HOLD_MS = 2200;
    private final SyncEngine engine;
    private final dev.vaultsync.core.Config cfg;
    VaultHud(SyncEngine engine, dev.vaultsync.core.Config cfg) { this.engine = engine; this.cfg = cfg; }

    @Override public void extractRenderState(GuiGraphicsExtractor ctx, DeltaTracker tick) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || !cfg.showIndicator) return; // bei F1 (GUI aus) werden HUD-Elemente ohnehin nicht gezeichnet
        SyncEngine.State s = engine.state();
        long age = engine.stateAgeMs();
        boolean busy = s == SyncEngine.State.SAVING || s == SyncEngine.State.UPLOADING;
        boolean result = s == SyncEngine.State.DONE || s == SyncEngine.State.ERROR;
        if (!busy && !(result && age < HOLD_MS + FADE_MS)) return;
        float alpha = busy ? 1f : age < HOLD_MS ? 1f : 1f - (age - HOLD_MS) / (float) FADE_MS;
        if (busy && age < 150) alpha = age / 150f;

        String label = switch (s) { case SAVING -> "Sichere Welt"; case UPLOADING -> engine.progress() > 0.005 ? "Synchronisiere " + (int) (engine.progress() * 100) + " %" : "Synchronisiere";
            case DONE -> "Gesichert"; default -> "Sicherung fehlgeschlagen"; };
        int w = ctx.guiWidth();
        int textW = mc.font.width(label);
        int cx = w - 12 - textW - 6 - 6;  // Mittelpunkt des Symbols (GUI-Einheiten)
        int cy = 14;
        int text = argb(alpha * 0.75f, 0xC8, 0xCC, 0xD2);
        ctx.text(mc.font, label, w - 10 - textW, cy - 4, text, false);

        var m = ctx.pose();
        m.pushMatrix();
        m.translate(cx, cy);
        m.scale(0.5f, 0.5f);          // 1 Zeichenschritt = halber GUI-Pixel
        if (busy) spinner(ctx, alpha, s == SyncEngine.State.UPLOADING);
        else if (s == SyncEngine.State.DONE) check(ctx, alpha);
        else cross(ctx, alpha);
        m.popMatrix();
    }

    private static void spinner(GuiGraphicsExtractor c, float alpha, boolean upload) {
        double head = (System.nanoTime() / 1e9) * (upload ? 5.2 : 4.2);
        double r = 9; int n = 52; double sweep = Math.PI * 1.35;
        // schwacher Hintergrundring
        for (int i = 0; i < 72; i++) {
            double a = i / 72.0 * Math.PI * 2;
            dot(c, a, r, argb(alpha * 0.14f, 255, 255, 255));
        }
        for (int i = 0; i < n; i++) {
            double t = i / (double) n;                 // 0 = Schweifende, 1 = Spitze
            double a = head - sweep * (1 - t);
            dot(c, a, r, argb(alpha * (float) (t * t), 0xF2, 0xF4, 0xF7));
            dot(c, a, r - 1, argb(alpha * (float) (t * t) * 0.8f, 0xF2, 0xF4, 0xF7)); // ~1,5 px Strichstärke
        }
    }

    private static void dot(GuiGraphicsExtractor c, double a, double r, int col) {
        int x = (int) Math.round(Math.cos(a) * r), y = (int) Math.round(Math.sin(a) * r);
        c.fill(x, y, x + 1, y + 1, col);
    }

    private static void check(GuiGraphicsExtractor c, float alpha) {
        int col = argb(alpha, 0x5B, 0xD9, 0x8C);
        line(c, -5, 0, -2, 4, col); line(c, -2, 4, 6, -4, col);
    }

    private static void cross(GuiGraphicsExtractor c, float alpha) {
        int col = argb(alpha, 0xF2, 0x6B, 0x6B);
        line(c, -4, -4, 4, 4, col); line(c, -4, 4, 4, -4, col);
    }

    private static void line(GuiGraphicsExtractor c, int x0, int y0, int x1, int y1, int col) {
        int n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (int i = 0; i <= n; i++) {
            int x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
            c.fill(x, y, x + 1, y + 1, col); c.fill(x, y + 1, x + 1, y + 2, col);
        }
    }

    private static int argb(float a, int r, int g, int b) {
        return (Math.max(0, Math.min(255, (int) (a * 255))) << 24) | (r << 16) | (g << 8) | b;
    }
}
