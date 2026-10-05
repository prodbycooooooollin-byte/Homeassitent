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

/**
 * Lädt ein Welt-Backup hoch. ANNAHME zum Protokoll (bitte mit der Seite abgleichen):
 *   POST {endpoint}, Header "Authorization: Bearer {apiKey}", multipart/form-data mit
 *   Feldern worldId, fingerprint, replacePrevious=true und Datei "file" (world.zip).
 * Die Seite ersetzt/löscht die alte Version selbst. Alles Protokollspezifische steht NUR in dieser Klasse.
 */
public final class VaultClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final Config cfg;

    public VaultClient(Config cfg) { this.cfg = cfg; }

    public void upload(String worldId, String fingerprint, Path zip) throws IOException, InterruptedException {
        String b = "----vaultsync" + UUID.randomUUID();
        byte[] head = (field(b, "worldId", worldId) + field(b, "fingerprint", fingerprint) + field(b, "replacePrevious", "true")
                + "--" + b + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"world.zip\"\r\n"
                + "Content-Type: application/zip\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] tail = ("\r\n--" + b + "--\r\n").getBytes(StandardCharsets.UTF_8);
        long len = head.length + Files.size(zip) + tail.length;

        HttpRequest.BodyPublisher body = HttpRequest.BodyPublishers.fromPublisher(HttpRequest.BodyPublishers.ofInputStream(() -> {
            try {
                return new SequenceInputStream(new SequenceInputStream(new ByteArrayInputStream(head), Files.newInputStream(zip)),
                        new ByteArrayInputStream(tail));
            } catch (IOException e) { throw new UncheckedIOException(e); }
        }), len);

        HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.endpoint))
                .timeout(Duration.ofMinutes(15))
                .header("Authorization", "Bearer " + cfg.apiKey)
                .header("Content-Type", "multipart/form-data; boundary=" + b)
                .POST(body).build();
        HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() / 100 != 2) throw new IOException("Server antwortete " + r.statusCode() + ": " + trim(r.body()));
    }

    private static String field(String b, String name, String v) {
        return "--" + b + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + v + "\r\n";
    }
    private static String trim(String s) { return s.length() > 200 ? s.substring(0, 200) : s; }
}
