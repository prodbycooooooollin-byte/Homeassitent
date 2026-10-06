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
import java.util.function.Supplier;

/** Eigenes Dashboard (/vault): komplett selbst gezeichnet, ohne Minecraft-Widgets. */
final class VaultScreen extends Screen {
    interface Actions {
        SyncEngine.Session session();
        String worldFolder();
        void save();
        void addCurrentWorld();
    }

    private static final int W = 360, H = 262, PAD = 14;
    private static final int BG = 0xF2101216, CARD = 0xFF171A20, LINE = 0xFF262A33, TEXT = 0xFFE8EAEE, MUTED = 0xFF8A919E,
            OK = 0xFF5BD98C, ERR = 0xFFF26B6B, WARN = 0xFFE5B65C, ACCENT = 0xFF6AA8FF, ACCENT_DIM = 0xFF22324A;

    private record Hit(int x, int y, int w, int h, Runnable action) { }

    private final SyncEngine engine;
    private final Config cfg;
    private final Actions act;
    private final List<Hit> hits = new ArrayList<>();
    private float scale = 1f; private int ox, oy;

    VaultScreen(SyncEngine engine, Config cfg, Actions act) {
        super(Component.literal("Vault"));
        this.engine = engine; this.cfg = cfg; this.act = act;
    }

    @Override public boolean isPauseScreen() { return false; }

    @Override public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
        hits.clear();
        g.fill(0, 0, width, height, 0x99000000); // Abdunkelung
        scale = Math.min(1f, Math.min((width - 16) / (float) W, (height - 16) / (float) H));
        ox = Math.round((width - W * scale) / 2f); oy = Math.round((height - H * scale) / 2f);
        int mx = Math.round((mouseX - ox) / scale), my = Math.round((mouseY - oy) / scale);
        var m = g.pose();
        m.pushMatrix(); m.translate(ox, oy); m.scale(scale, scale);
        draw(g, mx, my);
        m.popMatrix();
    }

    @Override public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        int mx = Math.round((float) (event.x() - ox) / scale), my = Math.round((float) (event.y() - oy) / scale);
        for (Hit h : hits) if (mx >= h.x && mx < h.x + h.w && my >= h.y && my < h.y + h.h) { h.action.run(); return true; }
        return super.mouseClicked(event, doubleClick);
    }

    // ---------------------------------------------------------------- Zeichnen

    private void draw(GuiGraphicsExtractor g, int mx, int my) {
        long now = System.currentTimeMillis();
        var session = act.session();
        boolean active = session != null;
        rounded(g, 0, 0, W, H, 6, BG);
        outline(g, 0, 0, W, H, 6, LINE);

        // Kopf
        spaced(g, "VAULT", PAD, 14, TEXT, 1.4f);
        text(g, active ? act.worldFolder() : "keine Welt aktiv", PAD, 30, MUTED, 1f);
        String stateText; int stateCol;
        if (!active) { stateText = "Nicht aktiv"; stateCol = MUTED; }
        else if (engine.paused()) { stateText = "Pausiert"; stateCol = WARN; }
        else switch (engine.state()) {
            case SAVING -> { stateText = "Speichert …"; stateCol = ACCENT; }
            case UPLOADING -> { stateText = "Sendet …"; stateCol = ACCENT; }
            case ERROR -> { stateText = "Fehler"; stateCol = ERR; }
            default -> { stateText = "Aktiv"; stateCol = OK; }
        }
        int pw = font.width(stateText) + 26;
        rounded(g, W - PAD - pw, 14, pw, 18, 9, CARD);
        rounded(g, W - PAD - pw + 9, 21, 5, 5, 2, stateCol);
        text(g, stateText, W - PAD - pw + 19, 19, TEXT, 1f);

        // Karten
        int gap = 6, cw = (W - 2 * PAD - 3 * gap) / 4, cy = 46, ch = 50;
        card(g, PAD, cy, cw, ch, "LETZTE SYNC", Fmt.ago(engine.lastStatsMs(), now),
                engine.lastStatsFields() > 0 ? engine.lastStatsFields() + " Werte · " + Fmt.size(engine.lastStatsBytes()) : "–");
        card(g, PAD + (cw + gap), cy, cw, ch, "LETZTER UPLOAD", Fmt.ago(engine.lastZipMs(), now),
                engine.lastZipBytes() > 0 ? Fmt.size(engine.lastZipBytes()) : "–");
        card(g, PAD + 2 * (cw + gap), cy, cw, ch, "NÄCHSTE SYNC", active && !engine.paused() ? Fmt.until(engine.nextStatsMs(), now) : "–",
                cfg.zipBackup && active ? "ZIP " + Fmt.until(engine.nextZipMs(), now) : "ZIP aus");
        String err = engine.state() == SyncEngine.State.ERROR ? engine.lastError() : "";
        card(g, PAD + 3 * (cw + gap), cy, cw, ch, "ZUSTAND", engine.state() == SyncEngine.State.ERROR ? "Fehler" : "In Ordnung",
                err.isEmpty() ? "keine Fehler" : fit(err, cw - 12));

        // Verlauf (links)
        int ly = 106, lw = 168;
        panel(g, PAD, ly, lw, 106, "VERLAUF");
        var hist = engine.history();
        if (hist.isEmpty()) text(g, "Noch keine Sicherung.", PAD + 10, ly + 30, MUTED, 1f);
        for (int i = 0; i < Math.min(6, hist.size()); i++) {
            var e = hist.get(i); int y = ly + 24 + i * 13;
            rounded(g, PAD + 10, y + 2, 4, 4, 2, e.ok() ? OK : ERR);
            text(g, Fmt.ago(e.timeMs(), now), PAD + 20, y, MUTED, 1f);
            String what = e.kind().equals(SyncEngine.ZIP) ? "ZIP" : "Stats";
            text(g, what, PAD + 74, y, TEXT, 1f);
            text(g, e.ok() ? (e.bytes() > 0 ? Fmt.size(e.bytes()) : "") : fit(e.message(), 50), PAD + 104, y, e.ok() ? MUTED : ERR, 1f);
        }

        // Einstellungen (rechts)
        int rx = PAD + lw + 8, rw = W - PAD - rx;
        panel(g, rx, ly, rw, 106, "EINSTELLUNGEN");
        label(g, "Statistiken alle (Min.)", rx + 10, ly + 22);
        int[] si = {1, 5, 10, 20, 30, 60};
        segmented(g, rx + 10, ly + 33, rw - 20, mx, my, si.length, i -> String.valueOf(si[i]), i -> cfg.intervalMinutes == si[i],
                i -> { cfg.intervalMinutes = si[i]; act.save(); });
        label(g, "Welt hochladen alle (Min.)", rx + 10, ly + 52);
        int[] zi = {0, 15, 30, 60, 120};
        segmented(g, rx + 10, ly + 63, rw - 20, mx, my, zi.length, i -> zi[i] == 0 ? "Aus" : String.valueOf(zi[i]),
                i -> zi[i] == 0 ? !cfg.zipBackup : cfg.zipBackup && cfg.zipIntervalMinutes == zi[i],
                i -> { if (zi[i] == 0) cfg.zipBackup = false; else { cfg.zipBackup = true; cfg.zipIntervalMinutes = zi[i]; } act.save(); });
        toggle(g, rx + 10, ly + 82, "Beim Verlassen hochladen", cfg.uploadOnExit, mx, my, () -> { cfg.uploadOnExit = !cfg.uploadOnExit; act.save(); });
        toggle(g, rx + 10, ly + 94, "Anzeige oben rechts", cfg.showIndicator, mx, my, () -> { cfg.showIndicator = !cfg.showIndicator; act.save(); });

        // Aktionen
        int by = 222, bh = 24, bw = (W - 2 * PAD - 2 * gap) / 3;
        if (active) {
            button(g, PAD, by, bw, bh, "Jetzt sichern", true, mx, my, session::syncNow);
            button(g, PAD + bw + gap, by, bw, bh, "Nur Statistiken", false, mx, my, session::statsNow);
            button(g, PAD + 2 * (bw + gap), by, bw, bh, engine.paused() ? "Fortsetzen" : "Pausieren", false, mx, my, () -> engine.setPaused(!engine.paused()));
        } else {
            button(g, PAD, by, 2 * bw + gap, bh, "Diese Welt sichern", true, mx, my, act::addCurrentWorld);
            text(g, cfg.apiKey.isEmpty() ? "Zugangscode fehlt in der Config" : "Welt nicht eingetragen", PAD + 2 * (bw + gap), by + 8, MUTED, 1f);
        }
        text(g, "ESC schließt", W - PAD - font.width("ESC schließt"), H - 12, MUTED, 1f);
    }

    // ---------------------------------------------------------------- Bausteine

    private void card(GuiGraphicsExtractor g, int x, int y, int w, int h, String label, String value, String sub) {
        rounded(g, x, y, w, h, 5, CARD);
        text(g, label, x + 7, y + 7, MUTED, 0.8f);
        text(g, fit(value, (int) ((w - 12) / 1.25f)), x + 7, y + 19, TEXT, 1.25f);
        text(g, fit(sub, w - 12), x + 7, y + 36, MUTED, 1f);
    }

    private void panel(GuiGraphicsExtractor g, int x, int y, int w, int h, String title) {
        rounded(g, x, y, w, h, 5, CARD);
        text(g, title, x + 10, y + 8, MUTED, 0.8f);
    }

    private void label(GuiGraphicsExtractor g, String s, int x, int y) { text(g, s, x, y, MUTED, 0.9f); }

    private void segmented(GuiGraphicsExtractor g, int x, int y, int w, int mx, int my, int n,
                           java.util.function.IntFunction<String> name, java.util.function.IntPredicate selected, java.util.function.IntConsumer pick) {
        int h = 14, sw = w / n;
        rounded(g, x, y, sw * n, h, 4, 0xFF0E1014);
        for (int i = 0; i < n; i++) {
            final int idx = i; int sx = x + i * sw;
            boolean sel = selected.test(i), hov = mx >= sx && mx < sx + sw && my >= y && my < y + h;
            if (sel) rounded(g, sx + 1, y + 1, sw - 2, h - 2, 3, ACCENT_DIM);
            else if (hov) rounded(g, sx + 1, y + 1, sw - 2, h - 2, 3, 0xFF1C2028);
            String t = name.apply(i);
            text(g, t, sx + (sw - font.width(t)) / 2, y + 3, sel ? ACCENT : TEXT, 1f);
            hits.add(new Hit(sx, y, sw, h, () -> pick.accept(idx)));
        }
    }

    private void toggle(GuiGraphicsExtractor g, int x, int y, String label, boolean on, int mx, int my, Runnable flip) {
        boolean hov = mx >= x && mx < x + 130 && my >= y - 1 && my < y + 11;
        rounded(g, x, y, 18, 9, 4, on ? ACCENT_DIM : 0xFF0E1014);
        rounded(g, on ? x + 10 : x + 1, y + 1, 7, 7, 3, on ? ACCENT : MUTED);
        text(g, label, x + 24, y + 1, hov ? TEXT : MUTED, 0.9f);
        hits.add(new Hit(x, y - 1, 130, 12, flip));
    }

    private void button(GuiGraphicsExtractor g, int x, int y, int w, int h, String label, boolean primary, int mx, int my, Runnable run) {
        boolean hov = mx >= x && mx < x + w && my >= y && my < y + h;
        int bg = primary ? (hov ? 0xFF7FB6FF : ACCENT) : (hov ? 0xFF222731 : CARD);
        rounded(g, x, y, w, h, 5, bg);
        if (!primary) outline(g, x, y, w, h, 5, LINE);
        text(g, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2, primary ? 0xFF0B1220 : TEXT, 1f);
        hits.add(new Hit(x, y, w, h, run));
    }

    private String fit(String s, int maxW) {
        if (font.width(s) <= maxW) return s;
        while (s.length() > 1 && font.width(s + "…") > maxW) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    private void text(GuiGraphicsExtractor g, String s, int x, int y, int color, float sc) {
        if (sc == 1f) { g.text(font, s, x, y, color, false); return; }
        var m = g.pose(); m.pushMatrix(); m.translate(x, y); m.scale(sc, sc);
        g.text(font, s, 0, 0, color, false);
        m.popMatrix();
    }

    private void spaced(GuiGraphicsExtractor g, String s, int x, int y, int color, float sc) {
        int cx = x;
        for (char c : s.toCharArray()) { text(g, String.valueOf(c), cx, y, color, sc); cx += Math.round((font.width(String.valueOf(c)) + 2) * sc); }
    }

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
        g.fill(x + r, y, x + w - r, y + 1, color); g.fill(x + r, y + h - 1, x + w - r, y + h, color);
        g.fill(x, y + r, x + 1, y + h - r, color); g.fill(x + w - 1, y + r, x + w, y + h - r, color);
    }
}
