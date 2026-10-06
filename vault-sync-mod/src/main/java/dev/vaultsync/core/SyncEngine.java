package dev.vaultsync.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Sichert eine geöffnete Welt periodisch. Kennt kein Minecraft – das Spiel hängt über {@link Hooks} dran. */
public final class SyncEngine {
    public enum State { IDLE, SAVING, UPLOADING, DONE, ERROR }

    /** Ein Eintrag im Verlauf (für das Dashboard). */
    public record Event(long timeMs, String kind, boolean ok, long bytes, String message) { }

    /** Vom Spiel bereitgestellt: Welt konsistent auf Platte bringen und Schreibzugriffe kurz pausieren. */
    public interface Hooks {
        /** Statistiken auf dem Server-Thread einsammeln (null = keine verfügbar). */
        Map<String, Object> collectStats() throws Exception;
        void saveAndFreeze() throws Exception;
        void unfreeze();
    }

    public static final String STATS = "Statistiken", ZIP = "Welt-ZIP";
    private static final int MAX_HISTORY = 30;

    private final Config cfg;
    private final VaultClient client;
    private final Consumer<String> log;
    private final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "VaultSync"); t.setDaemon(true); return t;
    });
    private final CopyOnWriteArrayList<Event> history = new CopyOnWriteArrayList<>();
    private volatile State state = State.IDLE;
    private volatile long stateSince = System.nanoTime();
    private volatile String lastError = "";
    private volatile String lastFingerprint = "";
    private volatile boolean paused;
    private volatile Consumer<String> chat = m -> { };
    private volatile long lastSuccessMs, lastStatsMs, lastZipMs, lastStatsAttempt, lastZipAttempt;
    private volatile long lastStatsBytes, lastZipBytes;
    private volatile int lastStatsFields;

    public SyncEngine(Config cfg, Consumer<String> log) { this.cfg = cfg; this.client = new VaultClient(cfg); this.log = log; }

    /** Rückmeldungen für manuelle Sicherungen – z. B. als Chatnachricht. */
    public void setChat(Consumer<String> c) { chat = c; }
    public State state() { return state; }
    public long stateAgeMs() { return (System.nanoTime() - stateSince) / 1_000_000; }
    public String lastError() { return lastError; }
    public boolean paused() { return paused; }
    public void setPaused(boolean p) { paused = p; }
    /** Zeitpunkte (ms seit 1970) bzw. 0, wenn es das noch nie gab. */
    public long lastSuccessMs() { return lastSuccessMs; }
    public long lastStatsMs() { return lastStatsMs; }
    public long lastZipMs() { return lastZipMs; }
    public long lastStatsBytes() { return lastStatsBytes; }
    public int lastStatsFields() { return lastStatsFields; }
    public long lastZipBytes() { return lastZipBytes; }
    /** Wann die nächste automatische Statistik- bzw. ZIP-Sicherung fällig ist (0 = nie / aus). */
    public long nextStatsMs() { return lastStatsAttempt == 0 ? 0 : lastStatsAttempt + cfg.intervalMinutes * 60_000L; }
    public long nextZipMs() { return !cfg.zipBackup || lastZipAttempt == 0 ? 0 : lastZipAttempt + cfg.zipIntervalMinutes * 60_000L; }
    /** Neueste zuerst. */
    public List<Event> history() { var l = new java.util.ArrayList<>(history); java.util.Collections.reverse(l); return l; }

    private void set(State s) { state = s; stateSince = System.nanoTime(); }
    private void record(String kind, boolean ok, long bytes, String msg) {
        history.add(new Event(System.currentTimeMillis(), kind, ok, bytes, msg));
        while (history.size() > MAX_HISTORY) history.remove(0);
    }

    public Session start(Path worldRoot, String worldId, Hooks hooks) {
        long now = System.currentTimeMillis();
        lastStatsAttempt = now; lastZipAttempt = now;
        // Jede Sekunde prüfen, was fällig ist – so wirken geänderte Intervalle sofort.
        ScheduledFuture<?> f = exec.scheduleWithFixedDelay(() -> { if (!paused) cycle(worldRoot, worldId, hooks, true, false); },
                1, 1, TimeUnit.SECONDS);
        return new Session(f, worldRoot, worldId, hooks);
    }

    public final class Session {
        private final ScheduledFuture<?> task; private final Path root; private final String id; private final Hooks hooks;
        Session(ScheduledFuture<?> t, Path r, String i, Hooks h) { task = t; root = r; id = i; hooks = h; }
        /** Sofort sichern (Statistiken + ZIP), im Hintergrund. */
        public void syncNow() { exec.execute(() -> cycle(root, id, hooks, true, true)); }
        /** Nur Statistiken, sofort. */
        public void statsNow() { exec.execute(() -> cycle(root, id, hooks, true, true, false)); }
        /** Beim Verlassen der Welt: Welt ist dann komplett gespeichert – letzter, konsistenter Stand. */
        public void stop() {
            task.cancel(false);
            if (!cfg.zipBackup || !cfg.uploadOnExit) return; // Statistiken brauchen den laufenden Server
            Thread t = new Thread(() -> cycle(root, id, null, false, true), "VaultSync-final"); // nicht-daemon: JVM wartet kurz
            t.start();
        }
    }

    /** Ein Durchlauf; synchron, damit Tests ihn direkt aufrufen können. */
    public void cycle(Path root, String worldId, Hooks hooks, boolean live) { cycle(root, worldId, hooks, live, false); }

    public void cycle(Path root, String worldId, Hooks hooks, boolean live, boolean force) { cycle(root, worldId, hooks, live, force, true); }

    /** @param force alles jetzt erledigen, unabhängig von den Intervallen (manuell / beim Verlassen). */
    public synchronized void cycle(Path root, String worldId, Hooks hooks, boolean live, boolean force, boolean withZip) {
        long now = System.currentTimeMillis();
        boolean doStats = hooks != null && (force || now - lastStatsAttempt >= cfg.intervalMinutes * 60_000L);
        boolean doZip = withZip && cfg.zipBackup && (force || now - lastZipAttempt >= cfg.zipIntervalMinutes * 60_000L);
        if (!doStats && !doZip) return;
        boolean notify = force && live, failed = false, any = false;
        if (doStats) {
            lastStatsAttempt = now;
            try {
                set(State.SAVING);
                var stats = hooks.collectStats();
                if (stats != null) {
                    set(State.UPLOADING);
                    long bytes = client.postStats(stats);
                    lastStatsMs = lastSuccessMs = System.currentTimeMillis(); lastStatsBytes = bytes; lastStatsFields = stats.size();
                    record(STATS, true, bytes, stats.size() + " Werte");
                    log.accept("Statistiken gesendet");
                    if (notify) chat.accept("Statistiken gesendet (" + stats.size() + " Werte).");
                    any = true;
                }
            } catch (Exception e) { failed = true; fail(STATS, e, notify); }
        }
        if (doZip) {
            lastZipAttempt = now;
            Path tmp = null; boolean frozen = false;
            try {
                set(State.SAVING);
                if (hooks != null) { hooks.saveAndFreeze(); frozen = true; }
                String fp = WorldZipper.fingerprint(root);
                if (fp.equals(lastFingerprint)) {
                    lastZipMs = lastSuccessMs = System.currentTimeMillis();
                    record(ZIP, true, 0, "unverändert, nichts hochgeladen");
                    if (notify) chat.accept("Welt unverändert seit der letzten Sicherung – nichts Neues hochzuladen.");
                    any = true;
                } else {
                    tmp = Files.createTempFile("vaultsync-", ".zip");
                    WorldZipper.zip(root, tmp);
                    long size = Files.size(tmp);
                    if (frozen) { hooks.unfreeze(); frozen = false; }
                    set(State.UPLOADING);
                    client.upload(root.getFileName().toString(), tmp);
                    lastFingerprint = fp;
                    lastZipMs = lastSuccessMs = System.currentTimeMillis(); lastZipBytes = size;
                    record(ZIP, true, size, "hochgeladen");
                    log.accept("Welt-ZIP hochgeladen (" + size / 1024 / 1024 + " MB)");
                    if (notify) chat.accept("Welt hochgeladen (" + Math.max(1, size / 1024 / 1024) + " MB).");
                    any = true;
                }
            } catch (Exception e) { failed = true; fail(ZIP, e, notify); }
            finally {
                if (frozen) hooks.unfreeze();
                if (tmp != null) try { Files.deleteIfExists(tmp); } catch (Exception ignored) { }
            }
        }
        set(failed ? State.ERROR : any ? State.DONE : State.IDLE);
    }

    private void fail(String kind, Exception e, boolean notify) {
        lastError = String.valueOf(e.getMessage());
        record(kind, false, 0, lastError);
        log.accept(kind + " fehlgeschlagen: " + e);
        if (notify) chat.accept(kind + " fehlgeschlagen: " + lastError);
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
    }
}
