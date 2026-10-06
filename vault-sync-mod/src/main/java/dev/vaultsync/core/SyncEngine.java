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
        /** Statistiken auf dem Server-Thread einsammeln (null = keine verfügbar). */
        java.util.Map<String, Object> collectStats() throws Exception;
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
    private volatile boolean paused;
    private volatile long lastZipMs;
    private volatile Consumer<String> chat = m -> { };
    /** Rückmeldungen für manuelle Sicherungen (/vault sync) – z. B. als Chatnachricht. */
    public void setChat(Consumer<String> c) { chat = c; }
    private volatile long lastSuccessMs;
    private volatile ScheduledFuture<?> scheduled;

    public SyncEngine(Config cfg, Consumer<String> log) { this.cfg = cfg; this.client = new VaultClient(cfg); this.log = log; }

    public State state() { return state; }
    public long stateAgeMs() { return (System.nanoTime() - stateSince) / 1_000_000; }
    public String lastError() { return lastError; }
    public boolean paused() { return paused; }
    public void setPaused(boolean p) { paused = p; }
    /** Zeitpunkt des letzten erfolgreichen Durchlaufs (ms seit 1970) oder 0. */
    public long lastSuccessMs() { return lastSuccessMs; }
    private void set(State s) { state = s; stateSince = System.nanoTime(); }

    public Session start(Path worldRoot, String worldId, Hooks hooks) {
        ScheduledFuture<?> f = exec.scheduleWithFixedDelay(() -> { if (!paused) cycle(worldRoot, worldId, hooks, true); },
                cfg.intervalMinutes, cfg.intervalMinutes, TimeUnit.MINUTES);
        return new Session(f, worldRoot, worldId, hooks);
    }

    public final class Session {
        private final ScheduledFuture<?> task; private final Path root; private final String id; private final Hooks hooks;
        Session(ScheduledFuture<?> t, Path r, String i, Hooks h) { task = t; root = r; id = i; hooks = h; }
        /** Sofort sichern (läuft im Hintergrund; das Ergebnis zeigt die Anzeige bzw. {@link #state()}). */
        public void syncNow() { exec.execute(() -> cycle(root, id, hooks, true, true)); }
        /** Beim Verlassen der Welt: Welt ist dann komplett gespeichert – letzter, konsistenter Stand. */
        public void stop() {
            task.cancel(false);
            if (!cfg.zipBackup) return; // Statistiken brauchen den laufenden Server
            Thread t = new Thread(() -> cycle(root, id, null, false, true), "VaultSync-final"); // nicht-daemon: JVM wartet kurz
            t.start();
        }
    }

    /** Ein Durchlauf; synchron, damit Tests ihn direkt aufrufen können. */
    public void cycle(Path root, String worldId, Hooks hooks, boolean live) { cycle(root, worldId, hooks, live, false); }

    /** @param forceZip ZIP auch dann hochladen, wenn der letzte Upload noch keine zipIntervalMinutes her ist (manuell / beim Verlassen). */
    public synchronized void cycle(Path root, String worldId, Hooks hooks, boolean live, boolean forceZip) {
        Path tmp = null;
        boolean frozen = false;
        try {
            set(State.SAVING);
            if (hooks != null) {
                var stats = hooks.collectStats();
                if (stats != null) { set(State.UPLOADING); client.postStats(stats); }
            }
            boolean zipDue = cfg.zipBackup && (forceZip || lastZipMs == 0
                    || System.currentTimeMillis() - lastZipMs >= cfg.zipIntervalMinutes * 60_000L);
            if (!zipDue) { lastSuccessMs = System.currentTimeMillis(); set(State.DONE); log.accept("Statistiken gesendet");
                if (forceZip && live) chat.accept(cfg.zipBackup ? "Statistiken gesendet." : "Statistiken gesendet. Welt-ZIP ist aus (zipBackup=false in der Config).");
                return; }
            set(State.SAVING);
            if (hooks != null) { hooks.saveAndFreeze(); frozen = true; }
            String fp = WorldZipper.fingerprint(root);
            if (fp.equals(lastFingerprint)) {
                lastZipMs = System.currentTimeMillis(); lastSuccessMs = lastZipMs; set(State.DONE);
                if (forceZip && live) chat.accept("Fertig – die Welt hat sich seit der letzten Sicherung nicht geändert, es ist nichts Neues hochzuladen.");
                return;
            }
            tmp = Files.createTempFile("vaultsync-", ".zip");
            WorldZipper.zip(root, tmp);
            if (frozen) { hooks.unfreeze(); frozen = false; }
            set(State.UPLOADING);
            client.upload(root.getFileName().toString(), tmp);
            lastFingerprint = fp;
            lastZipMs = System.currentTimeMillis();
            lastSuccessMs = System.currentTimeMillis();
            set(State.DONE);
            log.accept("Welt-ZIP hochgeladen (" + Files.size(tmp) / 1024 / 1024 + " MB)");
            if (forceZip && live) chat.accept("Welt hochgeladen (" + Math.max(1, Files.size(tmp) / 1024 / 1024) + " MB). Sie steht jetzt in der Versionsliste auf der Seite.");
        } catch (Exception e) {
            lastError = String.valueOf(e.getMessage());
            set(State.ERROR);
            log.accept("Sicherung fehlgeschlagen: " + e);
            if (forceZip && live) chat.accept("Fehlgeschlagen: " + lastError);
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        } finally {
            if (frozen) hooks.unfreeze();
            if (tmp != null) try { Files.deleteIfExists(tmp); } catch (Exception ignored) { }
        }
    }
}
