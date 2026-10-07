package dev.vaultsync.core;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class WorldZipper {
    private WorldZipper() { }

    /** session.lock ist unter Windows vom Spiel gesperrt und wird nie gebraucht. */
    private static boolean skip(Path rel) { return rel.getFileName().toString().equals("session.lock"); }

    /** Billiger Fingerabdruck (Pfad, Größe, Änderungszeit) – damit unveränderte Welten nicht erneut hochgeladen werden. */
    public static String fingerprint(Path root) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) {
                    Path rel = root.relativize(f);
                    if (!skip(rel)) md.update((rel + "|" + a.size() + "|" + a.lastModifiedTime().toMillis() + "\n").getBytes());
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFileFailed(Path f, IOException e) { return FileVisitResult.CONTINUE; }
            });
            return HexFormat.of().formatHex(md.digest());
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** Gesamtgröße der Weltdateien (ohne session.lock) in Bytes. */
    public static long size(Path root) throws IOException {
        long[] sum = {0};
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) {
                if (!skip(root.relativize(f))) sum[0] += a.size();
                return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFileFailed(Path f, IOException e) { return FileVisitResult.CONTINUE; }
        });
        return sum[0];
    }

    public static void zip(Path root, Path target) throws IOException { zip(root, target, null); }

    /** @param progress bekommt nach jeder Datei den Anteil 0..1 der gepackten Bytes */
    public static void zip(Path root, Path target, java.util.function.DoubleConsumer progress) throws IOException {
        final long total = progress == null ? 1 : Math.max(1, size(root));
        final long[] done = {0};
        try (OutputStream os = Files.newOutputStream(target); ZipOutputStream zos = new ZipOutputStream(os)) {
            zos.setLevel(Deflater.BEST_SPEED); // Regionsdateien sind schon komprimiert
            String top = root.getFileName().toString();
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) throws IOException {
                    Path rel = root.relativize(f);
                    if (skip(rel)) return FileVisitResult.CONTINUE;
                    try {
                        zos.putNextEntry(new ZipEntry(top + "/" + rel.toString().replace('\\', '/')));
                        Files.copy(f, zos);
                        zos.closeEntry();
                        if (progress != null) { done[0] += a.size(); progress.accept(Math.min(1.0, (double) done[0] / total)); }
                    } catch (NoSuchFileException e) { /* während des Zippens verschwunden */ }
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }
}
