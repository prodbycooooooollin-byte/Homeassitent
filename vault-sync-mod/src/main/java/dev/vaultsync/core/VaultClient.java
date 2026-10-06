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

    /** Größe eines Teils; klein genug für die Plattform der Seite. */
    public int chunkBytes = 4 * 1024 * 1024;
    /** Pause zwischen Wiederholungen (ms); in Tests kürzer. */
    public long retryDelayMs = 1500;

    /**
     * worldUploadChunk der Seite: die ZIP geht in Teilen (start → append … → finish) an die Funktion, die sie bei Dropbox
     * zusammensetzt. Header: X-WorldVault-Key (gleicher Schlüssel wie worldSync), X-Action, X-Session-Id, X-Offset, und bei finish
     * X-File-Name / X-World-Name. Die Seite behält die neuesten 3 Sicherungen und löscht ältere selbst.
     */
    public void upload(String worldName, Path zip) throws IOException, InterruptedException {
        String stamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm"));
        String safe = ascii(worldName);
        String sessionId = null; long offset = 0;
        try (InputStream in = new BufferedInputStream(Files.newInputStream(zip), 1 << 16)) {
            byte[] cur = in.readNBytes(chunkBytes);
            while (true) {
                byte[] next = in.readNBytes(chunkBytes);
                if (sessionId == null) {
                    sessionId = chunk("start", null, 0, cur, safe, stamp).sessionId;
                    offset = cur.length;
                    if (next.length == 0) { chunk("finish", sessionId, offset, new byte[0], safe, stamp); return; }
                } else if (next.length == 0) {
                    chunk("finish", sessionId, offset, cur, safe, stamp); return;
                } else {
                    chunk("append", sessionId, offset, cur, safe, stamp);
                    offset += cur.length;
                }
                cur = next;
            }
        }
    }

    private record Reply(String sessionId) { }

    /** Ein Teil, bis zu 3 Versuche bei Netz-/Serverfehlern (5xx); 401/413 sofort. */
    private Reply chunk(String action, String sessionId, long offset, byte[] data, String worldName, String stamp) throws IOException, InterruptedException {
        IOException last = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                var b = HttpRequest.newBuilder(URI.create(cfg.uploadEndpoint)).timeout(Duration.ofMinutes(5))
                        .header("X-WorldVault-Key", cfg.apiKey).header("X-Action", action)
                        .header("Content-Type", "application/octet-stream")
                        .POST(HttpRequest.BodyPublishers.ofByteArray(data));
                if (sessionId != null) b.header("X-Session-Id", sessionId).header("X-Offset", Long.toString(offset));
                if (action.equals("finish")) b.header("X-File-Name", worldName + "_" + stamp + ".zip").header("X-World-Name", worldName);
                HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
                int code = r.statusCode();
                if (code == 200) return new Reply(action.equals("start") ? jsonString(r.body(), "session_id") : sessionId);
                if (code == 401) throw new IOException("Falscher Schlüssel (apiKey)");
                if (code == 404) throw new IOException("Die Funktion worldUploadChunk gibt es auf der Seite noch nicht (404)");
                last = new IOException("Upload (" + action + "): Server antwortete " + code + ": " + trim(r.body()));
                if (code < 500) throw last;
            } catch (java.net.http.HttpTimeoutException | java.net.ConnectException e) {
                last = new IOException("Upload (" + action + "): " + e);
            }
            if (attempt < 3) Thread.sleep(retryDelayMs * attempt);
        }
        throw last;
    }

    /** Liest ein String-Feld aus einem flachen JSON-Objekt (genügt für {"ok":true,"session_id":"…"}). */
    static String jsonString(String json, String key) throws IOException {
        var m = java.util.regex.Pattern.compile("\"" + java.util.regex.Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        if (!m.find()) throw new IOException("Antwort ohne " + key + ": " + trim(json));
        return m.group(1);
    }

    /** HTTP-Header vertragen nur einfaches ASCII. */
    static String ascii(String s) {
        String t = s.replaceAll("[^\\x20-\\x7E]", "_").replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return t.isEmpty() ? "welt" : t;
    }

    private static String trim(String s) { return s.length() > 1500 ? s.substring(0, 1500) : s; }
}
