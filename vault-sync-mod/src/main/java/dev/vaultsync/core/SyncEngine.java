package dev.vaultsync.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Sichert eine geöffnete Welt periodisch. Kennt kein Minecraft – das Spiel hängt über {@link Hooks} dran. */
public final class SyncEngine {
    public enum State { IDLE, SAVING, UPLOADING, DONE, ERROR }

    /** Vom Spiel bereitgestellt: Welt konsistent auf Platte bringen und Schreibzugriffe kurz pausieren. */
    public interface Hooks {
        void saveAndFreeze() throws Exception;
        void unfreeze();
    }

    private final Config cfg;
    private final VaultClient client;
    private final Consumer<String> log;
    private final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "VaultSync"); t.setDaemon(true); return t;
    });
    private volatile State state = State.IDLE;
    private volatile long stateSince = System.nanoTime();
    private volatile String lastError = "";
    private volatile String lastFingerprint = "";

    public SyncEngine(Config cfg, Consumer<String> log) { this.cfg = cfg; this.client = new VaultClient(cfg); this.log = log; }

    public State state() { return state; }
    public long stateAgeMs() { return (System.nanoTime() - stateSince) / 1_000_000; }
    public String lastError() { return lastError; }
    private void set(State s) { state = s; stateSince = System.nanoTime(); }

    public Session start(Path worldRoot, String worldId, Hooks hooks) {
        ScheduledFuture<?> f = exec.scheduleWithFixedDelay(() -> cycle(worldRoot, worldId, hooks, true),
                cfg.intervalMinutes, cfg.intervalMinutes, TimeUnit.MINUTES);
        return new Session(f, worldRoot, worldId);
    }

    public final class Session {
        private final ScheduledFuture<?> task; private final Path root; private final String id;
        Session(ScheduledFuture<?> t, Path r, String i) { task = t; root = r; id = i; }
        /** Beim Verlassen der Welt: Welt ist dann komplett gespeichert – letzter, konsistenter Stand. */
        public void stop() {
            task.cancel(false);
            Thread t = new Thread(() -> cycle(root, id, null, false), "VaultSync-final"); // nicht-daemon: JVM wartet kurz
            t.start();
        }
    }

    /** Ein Durchlauf; synchron, damit Tests ihn direkt aufrufen können. */
    public synchronized void cycle(Path root, String worldId, Hooks hooks, boolean live) {
        Path tmp = null;
        boolean frozen = false;
        try {
            set(State.SAVING);
            if (hooks != null) { hooks.saveAndFreeze(); frozen = true; }
            String fp = WorldZipper.fingerprint(root);
            if (fp.equals(lastFingerprint)) { set(State.IDLE); return; }
            tmp = Files.createTempFile("vaultsync-", ".zip");
            WorldZipper.zip(root, tmp);
            if (frozen) { hooks.unfreeze(); frozen = false; }
            set(State.UPLOADING);
            client.upload(worldId, fp, tmp);
            lastFingerprint = fp;
            set(State.DONE);
            log.accept("Welt gesichert (" + Files.size(tmp) / 1024 / 1024 + " MB)");
        } catch (Exception e) {
            lastError = String.valueOf(e.getMessage());
            set(State.ERROR);
            log.accept("Sicherung fehlgeschlagen: " + e);
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        } finally {
            if (frozen) hooks.unfreeze();
            if (tmp != null) try { Files.deleteIfExists(tmp); } catch (Exception ignored) { }
        }
    }
}
