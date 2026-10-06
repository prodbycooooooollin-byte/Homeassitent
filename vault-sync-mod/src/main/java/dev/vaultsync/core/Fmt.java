package dev.vaultsync.core;

/** Kurze Anzeigeformate fürs Dashboard. */
public final class Fmt {
    private Fmt() { }

    public static String ago(long thenMs, long nowMs) {
        if (thenMs <= 0) return "noch nie";
        long s = Math.max(0, (nowMs - thenMs) / 1000);
        if (s < 5) return "gerade eben";
        if (s < 60) return "vor " + s + " s";
        if (s < 3600) return "vor " + s / 60 + " Min.";
        if (s < 86400) return "vor " + s / 3600 + " Std.";
        return "vor " + s / 86400 + " Tg.";
    }

    /** "in 4:32" bzw. "jetzt"; 0 = unbekannt. */
    public static String until(long atMs, long nowMs) {
        if (atMs <= 0) return "–";
        long s = (atMs - nowMs + 999) / 1000;
        if (s <= 0) return "jetzt";
        return s >= 3600 ? "in " + s / 3600 + " Std. " + (s % 3600) / 60 + " Min." : "in " + s / 60 + ":" + String.format("%02d", s % 60);
    }

    public static String size(long b) {
        if (b <= 0) return "–";
        if (b < 1024) return b + " B";
        if (b < 1024 * 1024) return String.format("%.1f KB", b / 1024.0);
        if (b < 1024L * 1024 * 1024) return String.format("%.1f MB", b / 1048576.0);
        return String.format("%.2f GB", b / 1073741824.0);
    }
}
