package dev.vaultsync.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Prüft vor dem Zippen, ob auf dem Laufwerk genug Platz ist. */
public final class DiskCheck {
    private DiskCheck() { }

    /** Platzbedarf der ZIP: Regionsdateien sind schon komprimiert, also etwa so groß wie die Welt, plus Reserve. */
    public static long needed(long worldBytes) { return worldBytes + worldBytes / 10 + 64L * 1024 * 1024; }

    /** Wirft eine verständliche Meldung, wenn {@code free} nicht reicht. {@code where} z. B. "Laufwerk D:". */
    public static void require(long worldBytes, long free, String where) throws IOException {
        long need = needed(worldBytes);
        if (free < need) throw new IOException("Zu wenig Speicherplatz auf " + where + ": frei " + Fmt.size(free) + ", nötig etwa " + Fmt.size(need));
    }

    /** Prüft den Datenträger, auf dem {@code dir} liegt (legt den Ordner bei Bedarf an). */
    public static void requireOn(Path dir, long worldBytes) throws IOException {
        Files.createDirectories(dir);
        var store = Files.getFileStore(dir);
        require(worldBytes, store.getUsableSpace(), "dem Laufwerk von " + dir);
    }
}
