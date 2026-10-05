package dev.vaultsync.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/** Einfache Konfiguration (config/vaultsync.properties). Welten: world.<Ordnername> = <WeltID auf der Seite>. */
public final class Config {
    public String endpoint = "https://vault-my-world.base44.app/functions/worldSync";
    public String apiKey = "";
    public int intervalMinutes = 5;
    public final Map<String, String> worlds = new LinkedHashMap<>();

    public static Config load(Path file) throws IOException {
        if (!Files.exists(file)) {
            Files.createDirectories(file.getParent());
            Files.writeString(file, """
                    # Vault Sync
                    endpoint=https://vault-my-world.base44.app/functions/worldSync
                    apiKey=
                    intervalMinutes=5
                    # Pro Welt: world.<Ordnername im saves-Ordner>=<Welt-ID auf der Seite>
                    # world.Meine\\ Welt=abc123
                    """);
        }
        Properties p = new Properties();
        try (var in = Files.newBufferedReader(file)) { p.load(in); }
        Config c = new Config();
        c.endpoint = p.getProperty("endpoint", c.endpoint).trim();
        c.apiKey = p.getProperty("apiKey", "").trim();
        try { c.intervalMinutes = Math.max(1, Integer.parseInt(p.getProperty("intervalMinutes", "5").trim())); }
        catch (NumberFormatException ignored) { }
        for (String k : p.stringPropertyNames())
            if (k.startsWith("world.") && !p.getProperty(k).isBlank()) c.worlds.put(k.substring(6), p.getProperty(k).trim());
        return c;
    }
}
