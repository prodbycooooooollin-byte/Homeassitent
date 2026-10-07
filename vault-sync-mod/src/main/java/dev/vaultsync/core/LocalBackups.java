package dev.vaultsync.core;

import java.io.IOException;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Stream;

/** Lokale Kopien der Welt-ZIP in einem Ordner deiner Wahl (z. B. in OneDrive/Dropbox) – bleibt auch bei Seitenproblemen erhalten. */
public final class LocalBackups {
    private LocalBackups() { }

    static String safe(String s) { return s.replaceAll("[\\\\/:*?\"<>|]", "_").trim(); }

    /** Kopiert die ZIP nach dir und behält nur die neuesten {@code keep} Kopien dieser Welt. */
    public static Path store(Path dir, String world, Path zip, int keep) throws IOException {
        Files.createDirectories(dir);
        String prefix = safe(world) + "_";
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"));
        Path target = dir.resolve(prefix + stamp + ".zip");
        Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
        try (Stream<Path> s = Files.list(dir)) {
            List<Path> mine = s.filter(p -> p.getFileName().toString().startsWith(prefix) && p.getFileName().toString().endsWith(".zip"))
                    .sorted((a, b) -> b.getFileName().toString().compareTo(a.getFileName().toString())).toList(); // neueste zuerst (Zeitstempel im Namen)
            for (int i = Math.max(1, keep); i < mine.size(); i++) Files.deleteIfExists(mine.get(i));
        }
        return target;
    }
}
