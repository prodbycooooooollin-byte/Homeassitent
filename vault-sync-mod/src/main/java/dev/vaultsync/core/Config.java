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
    public int intervalMinutes = 5;
    /** ZIP-Backup der Weltdateien: erst nutzbar, wenn die Seite eine Upload-Schnittstelle hat (worldSync nimmt keine Dateien an). */
    public boolean zipBackup = false;
    /** Ordnernamen der Welten (aus .minecraft/saves), für die gesichert wird. */
    public final java.util.Set<String> watched = new java.util.LinkedHashSet<>();
    public final Map<String, String> worlds = new LinkedHashMap<>();

    /** Übernimmt Werte aus einer frisch geladenen Konfiguration (für /vault reload). */
    public void copyFrom(Config o) {
        endpoint = o.endpoint; apiKey = o.apiKey; intervalMinutes = o.intervalMinutes; zipBackup = o.zipBackup;
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
                    # ZIP-Upload der Weltdateien (braucht eine Upload-Schnittstelle auf der Seite)
                    zipBackup=false
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
        for (String w : p.getProperty("worlds", "").split(",")) if (!w.isBlank()) c.watched.add(w.trim());
        for (String k : p.stringPropertyNames())
            if (k.startsWith("world.") && !p.getProperty(k).isBlank()) c.worlds.put(k.substring(6), p.getProperty(k).trim());
        return c;
    }
}
