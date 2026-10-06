import com.sun.net.httpserver.HttpServer;
import dev.vaultsync.core.*;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.zip.ZipInputStream;
import static org.junit.jupiter.api.Assertions.*;

class SyncEngineTest {
    /** Baut die Funktion worldUploadChunk nach und sammelt die Teile. */
    private static final class FakeSite {
        final HttpServer server; final AtomicInteger requests = new AtomicInteger(); final AtomicInteger finishes = new AtomicInteger();
        final java.io.ByteArrayOutputStream received = new java.io.ByteArrayOutputStream();
        final List<String> actions = Collections.synchronizedList(new ArrayList<>());
        volatile String fileName = "", worldName = "", key = ""; volatile long lastOffset; volatile int failFirst = 0; volatile int status = 200;
        FakeSite() throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", ex -> {
                byte[] body = ex.getRequestBody().readAllBytes(); requests.incrementAndGet();
                if (failFirst > 0) { failFirst--; ex.sendResponseHeaders(502, -1); ex.close(); return; }
                if (status != 200) { ex.sendResponseHeaders(status, -1); ex.close(); return; }
                var h = ex.getRequestHeaders(); key = h.getFirst("X-WorldVault-Key"); String a = h.getFirst("X-Action"); actions.add(a);
                long off = h.getFirst("X-Offset") == null ? 0 : Long.parseLong(h.getFirst("X-Offset"));
                if (!a.equals("start")) assertEquals(received.size(), off, "Offset muss zu den bisher empfangenen Bytes passen");
                received.writeBytes(body); lastOffset = off;
                if (a.equals("finish")) { finishes.incrementAndGet(); fileName = h.getFirst("X-File-Name"); worldName = h.getFirst("X-World-Name"); }
                byte[] resp = (a.equals("start") ? "{\"ok\":true,\"session_id\":\"SID1\",\"offset\":" + body.length + "}" : "{\"ok\":true}").getBytes();
                ex.sendResponseHeaders(200, resp.length); ex.getResponseBody().write(resp); ex.close();
            });
            server.start();
        }
        String url() { return "http://127.0.0.1:" + server.getAddress().getPort() + "/"; }
    }

    private static Path bigWorld(int bytes) throws Exception {
        Path w = Files.createTempDirectory("saves").resolve("Meine Welt"); Files.createDirectories(w.resolve("region"));
        Files.writeString(w.resolve("level.dat"), "x");
        byte[] data = new byte[bytes]; new Random(1).nextBytes(data); // nicht komprimierbar → ZIP ≈ so groß wie bytes
        Files.write(w.resolve("region/r.0.0.mca"), data);
        return w;
    }

    @Test void uploadsInChunksAndReassembles() throws Exception {
        FakeSite site = new FakeSite();
        Config c = new Config(); c.zipBackup = true; c.apiKey = "K"; c.endpoint = site.url(); c.uploadEndpoint = site.url();
        Path world = bigWorld(300_000);
        Path zip = Files.createTempFile("t", ".zip"); WorldZipper.zip(world, zip);
        VaultClient vc = new VaultClient(c); vc.chunkBytes = 64 * 1024;
        vc.upload("Meine Welt", zip);
        assertEquals("start", site.actions.get(0)); assertEquals("finish", site.actions.get(site.actions.size() - 1));
        assertTrue(site.actions.size() >= 5, site.actions.toString()); assertEquals(1, site.finishes.get());
        assertArrayEquals(Files.readAllBytes(zip), site.received.toByteArray());
        assertEquals("K", site.key); assertEquals("Meine Welt", site.worldName); assertTrue(site.fileName.startsWith("Meine Welt_") && site.fileName.endsWith(".zip"));
        site.server.stop(0);
    }

    @Test void smallFileIsStartPlusFinish() throws Exception {
        FakeSite site = new FakeSite();
        Config c = new Config(); c.apiKey = "K"; c.uploadEndpoint = site.url();
        Path z = Files.createTempFile("t", ".zip"); Files.writeString(z, "PKabc");
        new VaultClient(c).upload("W", z);
        assertEquals(List.of("start", "finish"), site.actions); assertEquals("PKabc", site.received.toString());
        site.server.stop(0);
    }

    @Test void retriesTransientErrorsAndStopsOnAuthError() throws Exception {
        FakeSite site = new FakeSite(); site.failFirst = 2;
        Config c = new Config(); c.apiKey = "K"; c.uploadEndpoint = site.url();
        VaultClient vc = new VaultClient(c); vc.retryDelayMs = 1;
        Path z = Files.createTempFile("t", ".zip"); Files.writeString(z, "PKabc");
        vc.upload("W", z);
        assertEquals(List.of("start", "finish"), site.actions); assertEquals(4, site.requests.get());
        site.status = 401;
        var ex = assertThrows(java.io.IOException.class, () -> vc.upload("W", z));
        assertTrue(ex.getMessage().contains("Schlüssel"));
        site.status = 404;
        ex = assertThrows(java.io.IOException.class, () -> vc.upload("W", z));
        assertTrue(ex.getMessage().contains("worldUploadChunk"));
        site.server.stop(0);
    }

    @Test void engineUploadsWorldViaChunks() throws Exception {
        FakeSite site = new FakeSite();
        Config c = new Config(); c.zipBackup = true; c.apiKey = "K"; c.endpoint = site.url(); c.uploadEndpoint = site.url();
        Path world = bigWorld(1000);
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { return null; } public void saveAndFreeze() { } public void unfreeze() { } };
        SyncEngine e = new SyncEngine(c, m -> { });
        e.cycle(world, "w1", h, true);
        assertEquals(SyncEngine.State.DONE, e.state()); assertEquals(1, site.finishes.get()); assertTrue(e.lastZipBytes() > 1000);
        e.cycle(world, "w1", h, true, true);
        assertEquals(1, site.finishes.get(), "unveränderte Welt wird nicht erneut hochgeladen");
        site.server.stop(0);
    }

    private static Map<String,Object> item() { var m = new LinkedHashMap<String,Object>(); m.put("id", "minecraft:dirt"); m.put("count", 2); return m; }

    @Test void statsAreSentAsKeyAndData() throws Exception {
        AtomicReference<String> got = new AtomicReference<>(); AtomicInteger code = new AtomicInteger(200);
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { got.set(new String(ex.getRequestBody().readAllBytes()) + "|" + ex.getRequestHeaders().getFirst("Content-Type"));
            ex.sendResponseHeaders(code.get(), -1); ex.close(); }); s.start();
        Config c = new Config(); c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/"; c.apiKey = "geheim";
        SyncEngine e = new SyncEngine(c, m -> { });
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { var m = new LinkedHashMap<String,Object>(); m.put("world_name", "A \"B\""); m.put("xp_level", 3);
                m.put("health", 19.5); m.put("hardcore", false); m.put("inventory", List.of(item())); return m; }
            public void saveAndFreeze() { fail("zipBackup ist aus"); } public void unfreeze() { } };
        e.cycle(Path.of("."), "w", h, true);
        assertEquals("{\"key\":\"geheim\",\"data\":{\"world_name\":\"A \\\"B\\\"\",\"xp_level\":3,\"health\":19.5,\"hardcore\":false,"
                + "\"inventory\":[{\"id\":\"minecraft:dirt\",\"count\":2}]}}|application/json", got.get());
        assertEquals(SyncEngine.State.DONE, e.state());
        code.set(404); e.cycle(Path.of("."), "w", h, true, true);
        assertEquals(SyncEngine.State.ERROR, e.state()); assertTrue(e.lastError().contains("noch keine Sicherung"));
        code.set(401); e.cycle(Path.of("."), "w", h, true, true);
        assertTrue(e.lastError().contains("Schlüssel")); s.stop(0);
    }

    @Test void syncNowAndPause() throws Exception {
        AtomicInteger posts = new AtomicInteger();
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { ex.getRequestBody().readAllBytes(); posts.incrementAndGet(); ex.sendResponseHeaders(200, -1); ex.close(); }); s.start();
        Config c = new Config(); c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/"; c.intervalMinutes = 60;
        SyncEngine e = new SyncEngine(c, m -> { });
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { return Map.of("xp_level", 1); }
            public void saveAndFreeze() { } public void unfreeze() { } };
        var session = e.start(Path.of("."), "w", h);
        session.syncNow();
        for (int i = 0; i < 50 && e.lastSuccessMs() == 0; i++) Thread.sleep(100);
        assertEquals(1, posts.get()); assertTrue(e.lastSuccessMs() > 0);
        e.setPaused(true); assertTrue(e.paused());
        Config n = new Config(); n.apiKey = "neu"; n.intervalMinutes = 9; n.watched.add("X"); c.copyFrom(n);
        assertEquals("neu", c.apiKey); assertEquals(9, c.intervalMinutes); assertTrue(c.watched.contains("X"));
        s.stop(0);
    }

    @Test void historyAndConfigSave() throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { ex.getRequestBody().readAllBytes(); ex.sendResponseHeaders(200, -1); ex.close(); }); s.start();
        Config c = new Config(); c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/";
        SyncEngine e = new SyncEngine(c, m -> { });
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { return Map.of("a", 1, "b", 2); }
            public void saveAndFreeze() { } public void unfreeze() { } };
        e.cycle(Path.of("."), "w", h, true, true);
        var ev = e.history().get(0);
        assertEquals(SyncEngine.STATS, ev.kind()); assertTrue(ev.ok()); assertEquals(2, e.lastStatsFields()); assertTrue(e.lastStatsBytes() > 10);
        assertTrue(e.nextStatsMs() == 0 || e.nextStatsMs() > System.currentTimeMillis());

        Path f = Files.createTempFile("cfg", ".properties");
        c.apiKey = "k"; c.intervalMinutes = 20; c.zipIntervalMinutes = 60; c.zipBackup = true; c.uploadOnExit = false; c.showIndicator = false;
        c.watched.add("Meine Welt"); c.uploadEndpoint = "http://x/up";
        c.save(f);
        Config r = Config.load(f);
        assertEquals(20, r.intervalMinutes); assertEquals(60, r.zipIntervalMinutes); assertTrue(r.zipBackup);
        assertFalse(r.uploadOnExit); assertFalse(r.showIndicator); assertEquals("k", r.apiKey);
        assertTrue(r.watched.contains("Meine Welt")); assertEquals("http://x/up", r.uploadEndpoint);
        s.stop(0);
    }

    @Test void zipSkipsLockAndKeepsFolder() throws Exception {
        Path w = Files.createTempDirectory("saves").resolve("W"); Files.createDirectories(w);
        Files.writeString(w.resolve("level.dat"), "x"); Files.writeString(w.resolve("session.lock"), "l");
        Path z = Files.createTempFile("t", ".zip"); WorldZipper.zip(w, z);
        List<String> names = new ArrayList<>();
        try (var in = new ZipInputStream(Files.newInputStream(z))) { for (var en = in.getNextEntry(); en != null; en = in.getNextEntry()) names.add(en.getName()); }
        assertEquals(List.of("W/level.dat"), names);
    }

    @Test void errorOnServerFailureStillThawsAndCleansUp() throws Exception {
        Path w = Files.createTempDirectory("saves").resolve("W"); Files.createDirectories(w); Files.writeString(w.resolve("a"), "1");
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { ex.getRequestBody().readAllBytes(); ex.sendResponseHeaders(500, -1); ex.close(); }); s.start();
        Config c = new Config(); c.zipBackup = true; c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/"; c.uploadEndpoint = c.endpoint;
        AtomicInteger th = new AtomicInteger();
        SyncEngine e = new SyncEngine(c, m -> { });
        e.cycle(w, "x", new SyncEngine.Hooks() { public Map<String,Object> collectStats() { return null; } public void saveAndFreeze() { } public void unfreeze() { th.incrementAndGet(); } }, true);
        assertEquals(SyncEngine.State.ERROR, e.state()); assertEquals(1, th.get()); s.stop(0);
    }
}
