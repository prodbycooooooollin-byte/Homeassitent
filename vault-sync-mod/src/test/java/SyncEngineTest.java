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
    @Test void uploadsOnceThenSkipsUnchanged() throws Exception {
        Path world = Files.createTempDirectory("saves").resolve("Meine Welt");
        Files.createDirectories(world.resolve("region"));
        Files.writeString(world.resolve("level.dat"), "x");
        Files.writeString(world.resolve("session.lock"), "locked");
        Files.writeString(world.resolve("region/r.0.0.mca"), "data");

        AtomicInteger posts = new AtomicInteger(); AtomicReference<String> auth = new AtomicReference<>();
        AtomicReference<byte[]> body = new AtomicReference<>();
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { posts.incrementAndGet(); auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            body.set(ex.getRequestBody().readAllBytes()); ex.sendResponseHeaders(200, -1); ex.close(); });
        s.start();
        Config c = new Config(); c.zipBackup = true; c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/"; c.apiKey = "K";
        AtomicInteger freezes = new AtomicInteger(), thaws = new AtomicInteger();
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { return null; } public void saveAndFreeze() { freezes.incrementAndGet(); } public void unfreeze() { thaws.incrementAndGet(); } };
        SyncEngine e = new SyncEngine(c, m -> { });
        e.cycle(world, "w1", h, true);
        assertEquals(SyncEngine.State.DONE, e.state()); assertEquals(1, posts.get()); assertEquals("Bearer K", auth.get());
        assertTrue(new String(body.get(), "ISO-8859-1").contains("name=\"worldId\"\r\n\r\nw1"));
        e.cycle(world, "w1", h, true);
        assertEquals(1, posts.get(), "unverändert → kein zweiter Upload");
        Files.writeString(world.resolve("level.dat"), "changed!");
        e.cycle(world, "w1", h, true);
        assertEquals(2, posts.get()); assertEquals(freezes.get(), thaws.get());
        s.stop(0);
    }

    @Test void statsAreSentAsKeyAndData() throws Exception {
        AtomicReference<String> got = new AtomicReference<>(); AtomicInteger code = new AtomicInteger(200);
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", ex -> { got.set(new String(ex.getRequestBody().readAllBytes()) + "|" + ex.getRequestHeaders().getFirst("Content-Type"));
            ex.sendResponseHeaders(code.get(), -1); ex.close(); }); s.start();
        Config c = new Config(); c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/"; c.apiKey = "geheim";
        SyncEngine e = new SyncEngine(c, m -> { });
        SyncEngine.Hooks h = new SyncEngine.Hooks() {
            public Map<String,Object> collectStats() { var m = new LinkedHashMap<String,Object>(); m.put("world_name", "A \"B\""); m.put("xp_level", 3);
                m.put("health", 19.5); m.put("hardcore", false); m.put("inventory", List.of(Map.of("id", "minecraft:dirt", "count", 2))); return m; }
            public void saveAndFreeze() { fail("zipBackup ist aus"); } public void unfreeze() { } };
        e.cycle(Path.of("."), "w", h, true);
        assertEquals("{\"key\":\"geheim\",\"data\":{\"world_name\":\"A \\\"B\\\"\",\"xp_level\":3,\"health\":19.5,\"hardcore\":false,"
                + "\"inventory\":[{\"id\":\"minecraft:dirt\",\"count\":2}]}}|application/json", got.get());
        assertEquals(SyncEngine.State.DONE, e.state());
        code.set(404); e.cycle(Path.of("."), "w", h, true);
        assertEquals(SyncEngine.State.ERROR, e.state()); assertTrue(e.lastError().contains("noch keine Sicherung"));
        code.set(401); e.cycle(Path.of("."), "w", h, true);
        assertTrue(e.lastError().contains("Schlüssel")); s.stop(0);
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
        Config c = new Config(); c.zipBackup = true; c.endpoint = "http://127.0.0.1:" + s.getAddress().getPort() + "/";
        AtomicInteger th = new AtomicInteger();
        SyncEngine e = new SyncEngine(c, m -> { });
        e.cycle(w, "x", new SyncEngine.Hooks() { public Map<String,Object> collectStats() { return null; } public void saveAndFreeze() { } public void unfreeze() { th.incrementAndGet(); } }, true);
        assertEquals(SyncEngine.State.ERROR, e.state()); assertEquals(1, th.get()); s.stop(0);
    }
}
