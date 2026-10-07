package dev.vaultsync.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/** Einfache Konfiguration (config/vaultsync.properties). Welten: worlds=<Ordnername,...>. */
public final class Config {
    public String endpoint = "https://vault-my-world.base44.app/functions/worldSync";
    public String apiKey = "";
    public volatile int intervalMinutes = 5;
    /** ZIP-Backup der Weltdateien über worldUpload. */
    public volatile boolean zipBackup = false;
    /** Adresse von worldUploadChunk; leer = aus endpoint abgeleitet (worldSync → worldUploadChunk). */
    public String uploadEndpoint = "";
    /** Wie oft die komplette Welt als ZIP hochgeladen wird (Statistiken gehen alle intervalMinutes). */
    public volatile int zipIntervalMinutes = 30;
    /** Beim Verlassen der Welt noch einmal komplett hochladen. */
    public volatile boolean uploadOnExit = true;
    /** Ordner für lokale Kopien der Welt-ZIP (leer = aus) und wie viele Kopien bleiben. */
    public volatile String localBackupDir = "";
    public volatile int localKeep = 3;
    /** Meldung (Toast) beim Verlassen der Welt über das Ergebnis der Sicherung. */
    public volatile boolean exitToast = true;
    /** Warnung, wenn die ZIP größer als so viele MB wird (0 = aus). */
    public volatile int warnZipMb = 1024;
    /** Statusanzeige oben rechts im Spiel. */
    public volatile boolean showIndicator = true;
    /** Ordnernamen der Welten (aus .minecraft/saves), für die gesichert wird. */
    public final java.util.Set<String> watched = new java.util.LinkedHashSet<>();
    public final Map<String, String> worlds = new LinkedHashMap<>();

    /** Übernimmt Werte aus einer frisch geladenen Konfiguration (für /vault reload). */
    public void copyFrom(Config o) {
        endpoint = o.endpoint; apiKey = o.apiKey; intervalMinutes = o.intervalMinutes; zipBackup = o.zipBackup; uploadEndpoint = o.uploadEndpoint; zipIntervalMinutes = o.zipIntervalMinutes;
        uploadOnExit = o.uploadOnExit; exitToast = o.exitToast; warnZipMb = o.warnZipMb; localBackupDir = o.localBackupDir; localKeep = o.localKeep; showIndicator = o.showIndicator;
        watched.clear(); watched.addAll(o.watched); worlds.clear(); worlds.putAll(o.worlds);
    }

    public static Config load(Path file) throws IOException {
        if (!Files.exists(file)) {
            Files.createDirectories(file.getParent());
            Files.writeString(file, """
                    # Vault Sync
                    endpoint=https://vault-my-world.base44.app/functions/worldSync
                    # Zugangscode der Seite (wird als "key" mitgesendet)
                    apiKey=
                    intervalMinutes=5
                    # Ordnernamen der Welten aus .minecraft/saves, kommagetrennt
                    worlds=
                    # Komplette Welt als ZIP auf die Seite hochladen (worldUpload), alle zipIntervalMinutes
                    zipBackup=true
                    zipIntervalMinutes=30
                    # Optional: zusätzlich lokale Kopien der Welt, z. B. localBackupDir=D:/Backups/Minecraft (Windows: Schrägstriche / benutzen)
                    localBackupDir=
                    localKeep=3
                    """);
        }
        Properties p = new Properties();
        try (var in = Files.newBufferedReader(file)) { p.load(in); }
        Config c = new Config();
        c.endpoint = p.getProperty("endpoint", c.endpoint).trim();
        c.apiKey = p.getProperty("apiKey", "").trim();
        try { c.intervalMinutes = Math.max(1, Integer.parseInt(p.getProperty("intervalMinutes", "5").trim())); }
        catch (NumberFormatException ignored) { }
        c.zipBackup = Boolean.parseBoolean(p.getProperty("zipBackup", "false").trim());
        try { c.zipIntervalMinutes = Math.max(1, Integer.parseInt(p.getProperty("zipIntervalMinutes", "30").trim())); }
        catch (NumberFormatException ignored) { }
        c.localBackupDir = p.getProperty("localBackupDir", "").trim();
        try { c.localKeep = Math.max(1, Integer.parseInt(p.getProperty("localKeep", "3").trim())); } catch (NumberFormatException ignored) { }
        c.exitToast = Boolean.parseBoolean(p.getProperty("exitToast", "true").trim());
        try { c.warnZipMb = Math.max(0, Integer.parseInt(p.getProperty("warnZipMb", "1024").trim())); } catch (NumberFormatException ignored) { }
        c.uploadOnExit = Boolean.parseBoolean(p.getProperty("uploadOnExit", "true").trim());
        c.showIndicator = Boolean.parseBoolean(p.getProperty("showIndicator", "true").trim());
        c.uploadEndpoint = p.getProperty("uploadEndpoint", "").trim();
        if (c.uploadEndpoint.isEmpty()) c.uploadEndpoint = c.endpoint.replaceAll("worldSync/?$", "worldUploadChunk");
        for (String w : p.getProperty("worlds", "").split(",")) if (!w.isBlank()) c.watched.add(w.trim());
        for (String k : p.stringPropertyNames())
            if (k.startsWith("world.") && !p.getProperty(k).isBlank()) c.worlds.put(k.substring(6), p.getProperty(k).trim());
        return c;
    }

    /** Schreibt alle Einstellungen zurück (für das Dashboard). */
    public synchronized void save(Path file) throws IOException {
        StringBuilder sb = new StringBuilder("# Vault Sync (wird vom Dashboard /vault geschrieben)\n");
        sb.append("endpoint=").append(endpoint).append('\n');
        sb.append("apiKey=").append(apiKey).append('\n');
        sb.append("intervalMinutes=").append(intervalMinutes).append('\n');
        sb.append("worlds=").append(String.join(", ", watched)).append('\n');
        sb.append("zipBackup=").append(zipBackup).append('\n');
        sb.append("zipIntervalMinutes=").append(zipIntervalMinutes).append('\n');
        sb.append("localBackupDir=").append(localBackupDir.replace("\\", "\\\\")).append('\n');
        sb.append("localKeep=").append(localKeep).append('\n');
        sb.append("exitToast=").append(exitToast).append('\n');
        sb.append("warnZipMb=").append(warnZipMb).append('\n');
        sb.append("uploadOnExit=").append(uploadOnExit).append('\n');
        sb.append("showIndicator=").append(showIndicator).append('\n');
        if (!uploadEndpoint.equals(endpoint.replaceAll("worldSync/?$", "worldUploadChunk"))) sb.append("uploadEndpoint=").append(uploadEndpoint).append('\n');
        worlds.forEach((k, v) -> sb.append("world.").append(k.replace(" ", "\\ ")).append('=').append(v).append('\n'));
        Files.writeString(file, sb.toString());
    }

    /** Soll die Welt gezippt werden (Upload und/oder lokale Kopie)? */
    public boolean zipEnabled() { return zipBackup || !localBackupDir.isBlank(); }
}
