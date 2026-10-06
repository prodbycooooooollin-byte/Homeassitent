package dev.vaultsync.core;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

public final class VaultClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final Config cfg;

    public VaultClient(Config cfg) { this.cfg = cfg; }

    /** worldSync: POST {key, data} als JSON. 401 = falscher Schlüssel, 404 = auf der Seite gibt es noch keine Sicherung. */
    public long postStats(java.util.Map<String, Object> data) throws IOException, InterruptedException {
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("key", cfg.apiKey); body.put("data", data);
        String json = Json.write(body);
        HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.endpoint)).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
        HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
        switch (r.statusCode()) {
            case 200 -> { }
            case 401 -> throw new IOException("Falscher Schlüssel (apiKey)");
            case 404 -> throw new IOException("Auf der Seite gibt es noch keine Sicherung – erst eine anlegen");
            default -> throw new IOException("Server antwortete " + r.statusCode() + ": " + trim(r.body()));
        }
        return json.getBytes(StandardCharsets.UTF_8).length;
    }

    /**
     * worldUpload der Seite: POST, Body = rohe ZIP, Header X-WorldVault-Key (gleicher Schlüssel wie worldSync),
     * X-File-Name, X-World-Name, X-Label. Die Seite behält die neuesten 3 Sicherungen und löscht ältere selbst.
     */
    public void upload(String worldName, Path zip) throws IOException, InterruptedException {
        String stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm"));
        String safe = ascii(worldName);
        HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.uploadEndpoint))
                .timeout(Duration.ofMinutes(30))
                .header("X-WorldVault-Key", cfg.apiKey)
                .header("X-File-Name", safe + "_" + stamp + ".zip")
                .header("X-World-Name", safe)
                .header("Content-Type", "application/zip")
                .POST(HttpRequest.BodyPublishers.ofFile(zip)).build();
        HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
        switch (r.statusCode()) {
            case 200 -> { }
            case 401 -> throw new IOException("Falscher Schlüssel (apiKey)");
            case 413 -> throw new IOException("Welt zu groß für die Seite (max. 4 GB)");
            default -> throw new IOException("Upload: Server antwortete " + r.statusCode() + ": " + trim(r.body()));
        }
    }

    /** HTTP-Header vertragen nur einfaches ASCII. */
    static String ascii(String s) {
        String t = s.replaceAll("[^\\x20-\\x7E]", "_").replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return t.isEmpty() ? "welt" : t;
    }

    private static String trim(String s) { return s.length() > 1500 ? s.substring(0, 1500) : s; }
}
