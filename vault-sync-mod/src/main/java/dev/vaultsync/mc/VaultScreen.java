package dev.vaultsync.mc;

import dev.vaultsync.core.Config;
import dev.vaultsync.core.Fmt;
import dev.vaultsync.core.SyncEngine;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;

/**
 * Kontrollzentrum (/vault): fährt oben rechts aus der Ecke, halbtransparente runde Kacheln im iOS-Stil.
 * Komplett selbst gezeichnet, keine Minecraft-Widgets.
 */
final class VaultScreen extends Screen {
    interface Actions {
        SyncEngine.Session session();
        String worldFolder();
        void save();
        void addCurrentWorld();
    }

    // Maße in Panel-Einheiten
    private static final int W = 232, MARGIN = 10, PAD = 10, GAP = 6;
    // iOS-Farben (ARGB, ohne Animation)
    private static final int PANEL = 0xD01C1C1E, PANEL_EDGE = 0x24FFFFFF, TILE = 0x1AFFFFFF, TILE_HOT = 0x2EFFFFFF, TRACK = 0x26FFFFFF;
    private static final int LABEL = 0xFFFFFFFF, LABEL2 = 0x99EBEBF5, LABEL3 = 0x4DEBEBF5;
    private static final int BLUE = 0xFF0A84FF, GREEN = 0xFF30D158, RED = 0xFFFF453A, ORANGE = 0xFFFF9F0A;
    private static final long OPEN_MS = 320, CLOSE_MS = 200;

    private record Hit(int x, int y, int w, int h, Runnable action) { }

    private final SyncEngine engine;
    private final Config cfg;
    private final Actions act;
    private final List<Hit> hits = new ArrayList<>();
    private final long openedAt = System.nanoTime();
    private long closingAt = 0;
    private float anim = 0f;                 // 0..1 Sichtbarkeit (Animation)
    private float sc = 1f; private int px, py, panelH;

    VaultScreen(SyncEngine engine, Config cfg, Actions act) {
        super(Component.literal("Vault"));
        this.engine = engine; this.cfg = cfg; this.act = act;
    }

    @Override public boolean isPauseScreen() { return false; }

    /** Schließen mit Animation. */
    @Override public void onClose() { if (closingAt == 0) closingAt = System.nanoTime(); }

    private static float easeOut(float t) { t = Math.max(0, Math.min(1, t)); return 1 - (float) Math.pow(1 - t, 3); }

    // ---------------------------------------------------------------- Rendern

    @Override public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
        long now = System.nanoTime();
        if (closingAt != 0) {
            anim = 1 - easeOut((now - closingAt) / 1e6f / CLOSE_MS);
            if (anim <= 0.001f) { super.onClose(); return; }
        } else anim = easeOut((now - openedAt) / 1e6f / OPEN_MS);

        hits.clear();
        sc = Math.min(1f, Math.min((height - 2 * MARGIN) / (float) Math.max(panelH, 1), (width - 2 * MARGIN) / (float) W));
        if (panelH == 0) sc = 1f;
        px = Math.round(width - MARGIN - W * sc); py = MARGIN;
        int mx = Math.round((mouseX - px) / sc), my = Math.round((mouseY - py) / sc);

        g.fill(0, 0, width, height, a(0x59000000));   // leichte Abdunkelung der Welt

        float pivotX = px + W * sc, pivotY = py;
        float s = 0.86f + 0.14f * anim;
        var m = g.pose();
        m.pushMatrix();
        m.translate(pivotX, pivotY - (1 - anim) * 14);  // fährt von oben ein
        m.scale(s, s);
        m.translate(-pivotX, -pivotY);
        m.translate(px, py);
        m.scale(sc, sc);
        panelH = draw(g, mx, my);
        m.popMatrix();
    }

    @Override public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (closingAt != 0 || anim < 0.9f) return true;
        int mx = Math.round((float) (event.x() - px) / sc), my = Math.round((float) (event.y() - py) / sc);
        if (mx < 0 || my < 0 || mx >= W || my >= panelH) { onClose(); return true; } // Klick daneben schließt
        for (Hit h : hits) if (mx >= h.x && mx < h.x + h.w && my >= h.y && my < h.y + h.h) { h.action.run(); return true; }
        return true;
    }

    // ---------------------------------------------------------------- Inhalt

    /** Zeichnet das Panel, gibt dessen Höhe zurück. */
    private int draw(GuiGraphicsExtractor g, int mx, int my) {
        long now = System.currentTimeMillis();
        var session = act.session();
        boolean active = session != null;
        boolean busy = engine.state() == SyncEngine.State.SAVING || engine.state() == SyncEngine.State.UPLOADING;
        boolean error = engine.state() == SyncEngine.State.ERROR;
        boolean warn = !error && !engine.warning().isEmpty();   // Hinweis (z. B. Welt wird groß), kein Fehler

        // Höhe vorab bestimmen (Hintergrund wird zuerst gezeichnet)
        int hHeader = 30, hRow = 54, hSliders = 88, hToggles = 48, hHist = 18 + 3 * 13, hErr = error || warn ? 30 : 0;
        int total = PAD + hHeader + GAP + hRow + GAP + hRow + GAP + hSliders + GAP + hToggles + GAP + hHist + (error || warn ? GAP + hErr : 0) + PAD;

        // Schatten + Panel
        for (int i = 6; i >= 1; i--) rounded(g, -i, -i + 3, W + 2 * i, total + 2 * i, 18 + i, a(0x0E000000));
        rounded(g, 0, 0, W, total, 18, a(PANEL));
        outline(g, 0, 0, W, total, 18, a(PANEL_EDGE));

        int y = PAD, x = PAD, iw = W - 2 * PAD;

        // Kopf: Titel + Weltname, rechts Status-Pille
        bold(g, "Vault", x + 2, y + 2, a(LABEL), 1.3f);
        text(g, fit(active ? act.worldFolder() : "keine Welt aktiv", 110), x + 2, y + 19, a(LABEL2), 0.9f);
        String st; int stc;
        if (!active) { st = "Aus"; stc = LABEL3; }
        else if (engine.paused()) { st = "Pausiert"; stc = ORANGE; }
        else if (error) { st = "Fehler"; stc = RED; }
        else if (busy) { st = "Synchronisiert"; stc = BLUE; }
        else { st = "Bereit"; stc = GREEN; }
        int pw = Math.round(font.width(st) * 0.9f) + 24;
        rounded(g, x + iw - pw, y + 3, pw, 18, 9, a(TILE));
        rounded(g, x + iw - pw + 8, y + 10, 5, 5, 2, a(stc));
        text(g, st, x + iw - pw + 17, y + 8, a(LABEL), 0.9f);
        y += hHeader + GAP;

        // Reihe 1: Sichern / Pause
        int tw = (iw - GAP) / 2;
        if (active) {
            tile(g, x, y, tw, hRow, mx, my, session::syncNow);
            circle(g, x + 8 + 15, y + hRow / 2, 15, a(busy ? BLUE : 0x33FFFFFF));
            if (busy) spinner(g, x + 8 + 15, y + hRow / 2, 8, a(LABEL)); else refreshIcon(g, x + 8 + 15, y + hRow / 2, a(LABEL));
            text(g, "Jetzt", x + 46, y + 14, a(LABEL), 0.95f);
            text(g, busy && engine.progress() > 0.005 ? (int) (engine.progress() * 100) + " %" : "sichern", x + 46, y + 26, a(busy ? BLUE : LABEL2), 0.85f);

            boolean p = engine.paused();
            tile(g, x + tw + GAP, y, tw, hRow, mx, my, () -> engine.setPaused(!engine.paused()));
            circle(g, x + tw + GAP + 8 + 15, y + hRow / 2, 15, a(p ? ORANGE : 0x33FFFFFF));
            if (p) playIcon(g, x + tw + GAP + 8 + 15, y + hRow / 2, a(LABEL)); else pauseIcon(g, x + tw + GAP + 8 + 15, y + hRow / 2, a(LABEL));
            text(g, p ? "Fortsetzen" : "Pausieren", x + tw + GAP + 46, y + 14, a(LABEL), 0.95f);
            text(g, p ? "aus Pause" : "Automatik", x + tw + GAP + 46, y + 26, a(LABEL2), 0.85f);
        } else {
            tile(g, x, y, iw, hRow, mx, my, act::addCurrentWorld);
            circle(g, x + 8 + 15, y + hRow / 2, 15, a(BLUE));
            plusIcon(g, x + 8 + 15, y + hRow / 2, a(LABEL));
            text(g, "Diese Welt sichern", x + 46, y + 14, a(LABEL), 0.95f);
            text(g, cfg.apiKey.isEmpty() ? "Zugangscode fehlt in der Config" : "Noch nicht eingetragen", x + 46, y + 26, a(cfg.apiKey.isEmpty() ? ORANGE : LABEL2), 0.85f);
        }
        y += hRow + GAP;

        // Reihe 2: Letzte Sicherung / Nächste Sicherung (mit Ring)
        tile(g, x, y, tw, hRow, mx, my, null);
        text(g, "LETZTE SICHERUNG", x + 9, y + 8, a(LABEL2), 0.7f);
        long lastAny = Math.max(engine.lastStatsMs(), engine.lastZipMs());
        bold(g, fit(Fmt.ago(lastAny, now), 100), x + 9, y + 19, a(LABEL), 1.1f);
        String sub = engine.lastZipBytes() > 0 ? "ZIP " + Fmt.size(engine.lastZipBytes()) : engine.lastStatsFields() > 0 ? engine.lastStatsFields() + " Werte" : "–";
        text(g, fit(sub, 100), x + 9, y + 36, a(LABEL2), 0.85f);

        int nx = x + tw + GAP;
        tile(g, nx, y, tw, hRow, mx, my, null);
        long next = engine.nextStatsMs();
        float prog = next == 0 || !active || engine.paused() ? 0f : 1f - Math.max(0f, Math.min(1f, (next - now) / (float) (cfg.intervalMinutes * 60_000L)));
        ring(g, nx + 9 + 14, y + hRow / 2, 12, 1f, a(TRACK));
        if (prog > 0) ring(g, nx + 9 + 14, y + hRow / 2, 12, prog, a(BLUE));
        text(g, "NÄCHSTE", nx + 46, y + 10, a(LABEL2), 0.7f);
        bold(g, active && !engine.paused() ? Fmt.until(next, now) : "–", nx + 46, y + 20, a(LABEL), 1.05f);
        text(g, cfg.zipBackup && active ? "ZIP " + Fmt.until(engine.nextZipMs(), now) : "ZIP aus", nx + 46, y + 36, a(LABEL2), 0.8f);
        y += hRow + GAP;

        // Regler: Statistiken / Welt hochladen
        tile(g, x, y, iw, hSliders, mx, my, null);
        int[] si = {1, 5, 10, 20, 30, 60};
        int cur = indexOf(si, cfg.intervalMinutes);
        text(g, "Statistiken", x + 10, y + 9, a(LABEL), 0.9f);
        String v1 = "alle " + cfg.intervalMinutes + " Min.";
        text(g, v1, x + iw - 10 - Math.round(font.width(v1) * 0.9f), y + 9, a(LABEL2), 0.9f);
        slider(g, x + 10, y + 22, iw - 20, si.length, cur, i -> { cfg.intervalMinutes = si[i]; act.save(); });

        int[] zi = {0, 15, 30, 60, 120};
        int zcur = !cfg.zipBackup ? 0 : Math.max(1, indexOf(zi, cfg.zipIntervalMinutes));
        text(g, "Welt hochladen", x + 10, y + 49, a(LABEL), 0.9f);
        String v2 = !cfg.zipBackup ? "aus" : "alle " + zi[zcur] + " Min.";
        text(g, v2, x + iw - 10 - Math.round(font.width(v2) * 0.9f), y + 49, a(LABEL2), 0.9f);
        slider(g, x + 10, y + 62, iw - 20, zi.length, zcur, i -> { if (zi[i] == 0) cfg.zipBackup = false; else { cfg.zipBackup = true; cfg.zipIntervalMinutes = zi[i]; } act.save(); });
        y += hSliders + GAP;

        // Schalter
        tile(g, x, y, iw, hToggles, mx, my, null);
        toggle(g, x + 10, y + 8, iw - 20, "Beim Verlassen hochladen", cfg.uploadOnExit, () -> { cfg.uploadOnExit = !cfg.uploadOnExit; act.save(); });
        toggle(g, x + 10, y + 27, iw - 20, "Anzeige oben rechts", cfg.showIndicator, () -> { cfg.showIndicator = !cfg.showIndicator; act.save(); });
        y += hToggles + GAP;

        // Verlauf
        tile(g, x, y, iw, hHist, mx, my, null);
        text(g, "VERLAUF", x + 10, y + 7, a(LABEL2), 0.7f);
        var hist = engine.history();
        if (hist.isEmpty()) text(g, "Noch nichts gesichert", x + 10, y + 22, a(LABEL3), 0.9f);
        for (int i = 0; i < Math.min(3, hist.size()); i++) {
            var e = hist.get(i); int ry = y + 19 + i * 13;
            circle(g, x + 14, ry + 4, 3, a(e.ok() ? GREEN : RED));
            text(g, e.kind().equals(SyncEngine.ZIP) ? "Welt" : e.kind().equals(SyncEngine.LOCAL) ? "Lokal" : "Stats", x + 24, ry, a(LABEL), 0.85f);
            String d = e.ok() ? (e.bytes() > 0 ? Fmt.size(e.bytes()) : "") : fit(e.message(), 70);
            text(g, d, x + 62, ry, a(e.ok() ? LABEL2 : RED), 0.85f);
            String t = Fmt.ago(e.timeMs(), now);
            text(g, t, x + iw - 10 - Math.round(font.width(t) * 0.85f), ry, a(LABEL3), 0.85f);
        }
        y += hHist;

        if (error || warn) {
            y += GAP;
            rounded(g, x, y, iw, hErr, 12, a(error ? 0x40FF453A : 0x40FF9F0A));
            text(g, error ? "Fehler" : "Hinweis", x + 10, y + 6, a(error ? RED : ORANGE), 0.8f);
            text(g, fit(error ? engine.lastError() : engine.warning(), Math.round((iw - 20) / 0.85f)), x + 10, y + 17, a(LABEL), 0.85f);
        }
        return total;
    }

    // ---------------------------------------------------------------- Bausteine

    private static int indexOf(int[] a, int v) { int best = 0; for (int i = 0; i < a.length; i++) if (Math.abs(a[i] - v) < Math.abs(a[best] - v)) best = i; return best; }

    /** Kachel; mit Aktion reagiert sie auf Hover und Klick. */
    private void tile(GuiGraphicsExtractor g, int x, int y, int w, int h, int mx, int my, Runnable action) {
        boolean hov = action != null && mx >= x && mx < x + w && my >= y && my < y + h;
        rounded(g, x, y, w, h, 12, a(hov ? TILE_HOT : TILE));
        if (action != null) hits.add(new Hit(x, y, w, h, action));
    }

    /** Stufenregler im iOS-Stil: heller Verlauf bis zur gewählten Stufe, Stufen sind klickbar. */
    private void slider(GuiGraphicsExtractor g, int x, int y, int w, int n, int cur, IntConsumer pick) {
        int h = 16;
        rounded(g, x, y, w, h, 8, a(TRACK));
        int fillW = Math.max(h, Math.round((w) * (cur + 1) / (float) n));
        rounded(g, x, y, fillW, h, 8, a(cur == 0 && n > 0 && false ? TRACK : 0xF2FFFFFF));
        for (int i = 0; i < n; i++) {
            final int idx = i; int sx = x + Math.round(i * w / (float) n), ex = x + Math.round((i + 1) * w / (float) n);
            if (i > 0 && i > cur) circle(g, sx + (ex - sx) / 2, y + h / 2, 1, a(LABEL3));
            hits.add(new Hit(sx, y - 3, ex - sx, h + 6, () -> pick.accept(idx)));
        }
    }

    private void toggle(GuiGraphicsExtractor g, int x, int y, int w, String label, boolean on, Runnable flip) {
        text(g, label, x, y + 4, a(LABEL), 0.9f);
        int sw = 26, sh = 15, sx = x + w - sw;
        rounded(g, sx, y, sw, sh, 7, a(on ? GREEN : TRACK));
        circle(g, on ? sx + sw - 7 - 1 : sx + 7 + 1, y + sh / 2, 6, a(0xFFFFFFFF));
        hits.add(new Hit(x, y - 2, w, sh + 4, flip));
    }

    // ---------------------------------------------------------------- Symbole

    private void spinner(GuiGraphicsExtractor g, int cx, int cy, int r, int color) {
        double head = (System.nanoTime() / 1e9) * 5.0;
        arc(g, cx, cy, r, head - Math.PI * 1.3, Math.PI * 1.3, color, true);
    }

    private void refreshIcon(GuiGraphicsExtractor g, int cx, int cy, int color) {
        arc(g, cx, cy, 8, -Math.PI * 0.35, Math.PI * 1.55, color, false);
        // Pfeilspitze am Ende des Bogens
        double a = -Math.PI * 0.35;
        int ax = cx + (int) Math.round(Math.cos(a) * 8), ay = cy + (int) Math.round(Math.sin(a) * 8);
        g.fill(ax - 1, ay - 3, ax + 4, ay - 2, color); g.fill(ax, ay - 2, ax + 3, ay - 1, color); g.fill(ax + 1, ay - 1, ax + 2, ay, color);
    }

    private void pauseIcon(GuiGraphicsExtractor g, int cx, int cy, int color) {
        rounded(g, cx - 5, cy - 6, 4, 12, 1, color); rounded(g, cx + 1, cy - 6, 4, 12, 1, color);
    }

    private void playIcon(GuiGraphicsExtractor g, int cx, int cy, int color) {
        for (int i = 0; i < 12; i++) { int half = Math.min(i, 11 - i); g.fill(cx - 4 + i / 2, cy - 6 + i, cx - 4 + i / 2 + 8 - (i < 6 ? 6 - i : i - 5) , cy - 5 + i, color); }
    }

    private void plusIcon(GuiGraphicsExtractor g, int cx, int cy, int color) {
        g.fill(cx - 6, cy - 1, cx + 6, cy + 1, color); g.fill(cx - 1, cy - 6, cx + 1, cy + 6, color);
    }

    /** Ring (volle Linie, Anteil 0..1 ab 12 Uhr). */
    private void ring(GuiGraphicsExtractor g, int cx, int cy, int r, float frac, int color) {
        arc(g, cx, cy, r, -Math.PI / 2, Math.PI * 2 * frac, color, false);
    }

    /** Bogen aus 1×1-Punkten in halber Pixelgröße (feinere Linie). fade = Schweif nach hinten ausblenden. */
    private void arc(GuiGraphicsExtractor g, int cx, int cy, int r, double start, double sweep, int color, boolean fade) {
        var m = g.pose(); m.pushMatrix(); m.translate(cx, cy); m.scale(0.5f, 0.5f);
        int n = Math.max(8, (int) (Math.abs(sweep) * r * 2.2));
        for (int i = 0; i <= n; i++) {
            double t = i / (double) n, ang = start + sweep * t;
            int col = fade ? withAlpha(color, (float) (t * t)) : color;
            int x = (int) Math.round(Math.cos(ang) * r * 2), y = (int) Math.round(Math.sin(ang) * r * 2);
            g.fill(x, y, x + 2, y + 2, col);   // 2×2 halbe Pixel = 1 GUI-Einheit Strichstärke
        }
        m.popMatrix();
    }

    private static int withAlpha(int argb, float f) { int al = Math.round(((argb >>> 24) & 0xFF) * f); return (al << 24) | (argb & 0xFFFFFF); }

    // ---------------------------------------------------------------- Zeichen-Helfer

    /** Alpha mit der Einblend-Animation verrechnen. */
    private int a(int argb) { return withAlpha(argb, anim); }

    private String fit(String s, int maxW) {
        if (font.width(s) <= maxW) return s;
        while (s.length() > 1 && font.width(s + "…") > maxW) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    private void text(GuiGraphicsExtractor g, String s, int x, int y, int color, float scale) {
        if (scale == 1f) { g.text(font, s, x, y, color, false); return; }
        var m = g.pose(); m.pushMatrix(); m.translate(x, y); m.scale(scale, scale);
        g.text(font, s, 0, 0, color, false);
        m.popMatrix();
    }

    /** Halbfett: der Text wird um einen halben Pixel versetzt doppelt gezeichnet. */
    private void bold(GuiGraphicsExtractor g, String s, int x, int y, int color, float scale) {
        var m = g.pose(); m.pushMatrix(); m.translate(x, y); m.scale(scale, scale);
        g.text(font, s, 0, 0, color, false); g.text(font, s, 1, 0, color, false);
        m.popMatrix();
    }

    private static void circle(GuiGraphicsExtractor g, int cx, int cy, int r, int color) { rounded(g, cx - r, cy - r, 2 * r, 2 * r, r, color); }

    /** Rechteck mit abgerundeten Ecken (Radius r) aus Zeilen-Füllungen. */
    private static void rounded(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
        r = Math.min(r, Math.min(w, h) / 2);
        for (int i = 0; i < h; i++) {
            int d = i < r ? r - i : i >= h - r ? i - (h - r - 1) : 0;
            int inset = d == 0 ? 0 : r - (int) Math.round(Math.sqrt(Math.max(0, r * r - (d - 0.5) * (d - 0.5))));
            g.fill(x + inset, y + i, x + w - inset, y + i + 1, color);
        }
    }

    private static void outline(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int color) {
        r = Math.min(r, Math.min(w, h) / 2);
        for (int i = 0; i < h; i++) {
            int d = i < r ? r - i : i >= h - r ? i - (h - r - 1) : 0;
            int inset = d == 0 ? 0 : r - (int) Math.round(Math.sqrt(Math.max(0, r * r - (d - 0.5) * (d - 0.5))));
            if (i == 0 || i == h - 1) g.fill(x + inset, y + i, x + w - inset, y + i + 1, color);
            else { g.fill(x + inset, y + i, x + inset + 1, y + i + 1, color); g.fill(x + w - inset - 1, y + i, x + w - inset, y + i + 1, color); }
        }
    }
}
