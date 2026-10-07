package dev.vaultsync.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
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

    public static final String STATS = "Statistiken", ZIP = "Welt-ZIP", LOCAL = "Lokale Kopie";
    public static final String EXIT_PREFIX = "Beim Verlassen: ";
    private static final int MAX_HISTORY = 40;

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
    private volatile double progress;
    private volatile String phase = "";
    private volatile Runnable exitStartListener = () -> { };
    private volatile Path stateFile;
    private final StatsGuard guard = new StatsGuard();
    private volatile long announcedExitMs;
    private volatile String warning = "";
    private volatile java.util.function.BiConsumer<Boolean, String> exitListener = (ok, m) -> { };

    public SyncEngine(Config cfg, Consumer<String> log) { this.cfg = cfg; this.client = new VaultClient(cfg); this.log = log; }

    /** Rückmeldungen für manuelle Sicherungen – z. B. als Chatnachricht. */
    public void setChat(Consumer<String> c) { chat = c; }
    /** Wird aufgerufen, wenn die Sicherung beim Verlassen der Welt fertig ist (ok, Text) – z. B. für eine Meldung auf dem Titelbildschirm. */
    public void setExitListener(java.util.function.BiConsumer<Boolean, String> l) { exitListener = l; }
    /** Wird aufgerufen, sobald beim Verlassen der Welt eine Sicherung beginnt (z. B. um einen Fortschritts-Toast zu zeigen). */
    public void setExitStartListener(Runnable r) { exitStartListener = r; }
    /** Was gerade passiert, z. B. "Welt wird gepackt"; leer = nichts. */
    public String phase() { return phase; }
    /** Hinweis, der kein Fehler ist (z. B. Welt wird groß); leer = keiner. */
    public String warning() { return warning; }
    public State state() { return state; }
    public long stateAgeMs() { return (System.nanoTime() - stateSince) / 1_000_000; }
    public String lastError() { return lastError; }
    public boolean paused() { return paused; }
    public void setPaused(boolean p) { paused = p; }
    /** Fortschritt des laufenden Uploads, 0..1. */
    public double progress() { return progress; }
    /** Zeitpunkte (ms seit 1970) bzw. 0, wenn es das noch nie gab. */
    public long lastSuccessMs() { return lastSuccessMs; }
    public long lastStatsMs() { return lastStatsMs; }
    public long lastZipMs() { return lastZipMs; }
    public long lastStatsBytes() { return lastStatsBytes; }
    public int lastStatsFields() { return lastStatsFields; }
    public long lastZipBytes() { return lastZipBytes; }
    /** Wann die nächste automatische Statistik- bzw. ZIP-Sicherung fällig ist (0 = nie / aus). */
    public long nextStatsMs() { return lastStatsAttempt == 0 ? 0 : lastStatsAttempt + cfg.intervalMinutes * 60_000L; }
    public long nextZipMs() { return !cfg.zipEnabled() || lastZipAttempt == 0 ? 0 : lastZipAttempt + cfg.zipIntervalMinutes * 60_000L; }
    /** Neueste zuerst. */
    public List<Event> history() { var l = new ArrayList<>(history); Collections.reverse(l); return l; }

    private void set(State s) { state = s; stateSince = System.nanoTime(); }
    private void record(String kind, boolean ok, long bytes, String msg) {
        history.add(new Event(System.currentTimeMillis(), kind, ok, bytes, msg));
        while (history.size() > MAX_HISTORY) history.remove(0);
        saveState();
    }

    // ---------------------------------------------------------------- Zustand auf der Platte (überlebt Neustarts)

    private synchronized void loadState(Path file) {
        stateFile = file;
        history.clear();
        lastFingerprint = ""; announcedExitMs = 0; guard.clear();
        if (file == null || !Files.exists(file)) return;
        try {
            for (String line : Files.readAllLines(file)) {
                int i = line.indexOf('=');
                if (i < 0) continue;
                String k = line.substring(0, i), v = line.substring(i + 1);
                try {
                    switch (k) {
                        case "fp" -> lastFingerprint = v;
                        case "zipMs" -> lastZipMs = Long.parseLong(v);
                        case "statsMs" -> lastStatsMs = Long.parseLong(v);
                        case "zipBytes" -> lastZipBytes = Long.parseLong(v);
                        case "statsBytes" -> lastStatsBytes = Long.parseLong(v);
                        case "statsFields" -> lastStatsFields = Integer.parseInt(v);
                        case "announced" -> announcedExitMs = Long.parseLong(v);
                        case "g" -> { int j = v.indexOf(':'); if (j > 0) guard.remember(v.substring(0, j), Double.parseDouble(v.substring(j + 1))); }
                        case "ev" -> {
                            String[] p = v.split("\t", 5);
                            if (p.length == 5) history.add(new Event(Long.parseLong(p[0]), p[1], p[2].equals("1"), Long.parseLong(p[3]), p[4]));
                        }
                        default -> { }
                    }
                } catch (NumberFormatException ignored) { }
            }
        } catch (IOException e) { log.accept("Verlauf nicht lesbar: " + e); }
    }

    private synchronized void saveState() {
        Path f = stateFile;
        if (f == null) return;
        StringBuilder sb = new StringBuilder();
        sb.append("fp=").append(lastFingerprint).append('\n').append("zipMs=").append(lastZipMs).append('\n').append("statsMs=").append(lastStatsMs).append('\n')
          .append("zipBytes=").append(lastZipBytes).append('\n').append("statsBytes=").append(lastStatsBytes).append('\n')
          .append("statsFields=").append(lastStatsFields).append('\n').append("announced=").append(announcedExitMs).append('\n');
        guard.snapshot().forEach((k, v) -> sb.append("g=").append(k).append(':').append(v).append('\n'));
        for (Event e : history)
            sb.append("ev=").append(e.timeMs()).append('\t').append(e.kind()).append('\t').append(e.ok() ? 1 : 0).append('\t').append(e.bytes()).append('\t')
              .append(e.message().replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')).append('\n');
        try { Files.createDirectories(f.getParent()); Files.writeString(f, sb.toString()); } catch (IOException e) { log.accept("Verlauf nicht speicherbar: " + e); }
    }

    // ---------------------------------------------------------------- Ablauf

    public Session start(Path worldRoot, String worldId, Hooks hooks) { return start(worldRoot, worldId, hooks, null); }

    /** @param state Datei für Verlauf und letzten Stand dieser Welt (null = nicht speichern). */
    public Session start(Path worldRoot, String worldId, Hooks hooks, Path state) {
        loadState(state);
        long now = System.currentTimeMillis();
        lastStatsAttempt = now; lastZipAttempt = now;
        // Jede Sekunde prüfen, was fällig ist – so wirken geänderte Intervalle sofort.
        ScheduledFuture<?> f = exec.scheduleWithFixedDelay(() -> { if (!paused) cycle(worldRoot, worldId, hooks, true, false); },
                1, 1, TimeUnit.SECONDS);
        // Ergebnis der letzten Sicherung beim Verlassen kurz nach dem Betreten melden
        Event lastExit = history().stream().filter(e -> e.message().startsWith(EXIT_PREFIX)).findFirst().orElse(null);
        if (lastExit != null && lastExit.timeMs() > announcedExitMs) {
            exec.schedule(() -> {
                chat.accept((lastExit.ok() ? "Letztes Verlassen der Welt: " : "Letztes Verlassen der Welt – Sicherung fehlgeschlagen: ")
                        + lastExit.message().substring(EXIT_PREFIX.length()) + " (" + Fmt.ago(lastExit.timeMs(), System.currentTimeMillis()) + ")");
                announcedExitMs = lastExit.timeMs(); saveState();
            }, 6, TimeUnit.SECONDS);
        }
        return new Session(f, worldRoot, worldId, hooks);
    }

    public final class Session {
        private final ScheduledFuture<?> task; private final Path root; private final String id; private final Hooks hooks;
        Session(ScheduledFuture<?> t, Path r, String i, Hooks h) { task = t; root = r; id = i; hooks = h; }
        /** Sofort sichern (Statistiken + ZIP), im Hintergrund. */
        public void syncNow() { exec.execute(() -> cycle(root, id, hooks, true, true)); }
        /** Nur Statistiken, sofort. */
        public void statsNow() { exec.execute(() -> cycle(root, id, hooks, true, true, false)); }

        /**
         * Welt wird verlassen: erst warten, bis der Server wirklich fertig gespeichert und beendet hat, dann den letzten, konsistenten
         * Stand hochladen. Läuft in einem eigenen (nicht-daemon) Thread, damit ein Wechsel ins Hauptmenü nichts blockiert.
         * @return der Thread (null, wenn nichts zu tun ist)
         */
        public Thread stop(BooleanSupplier serverStopped) {
            task.cancel(false);
            if (!cfg.zipEnabled() || !cfg.uploadOnExit) return null;
            phase = "Warte auf Minecraft"; progress = 0;
            try { exitStartListener.run(); } catch (RuntimeException e) { log.accept("Fortschrittsanzeige fehlgeschlagen: " + e); }
            Thread t = new Thread(() -> {
                long until = System.currentTimeMillis() + 120_000;
                try {
                    while (serverStopped != null && !serverStopped.getAsBoolean() && System.currentTimeMillis() < until) Thread.sleep(200);
                    Thread.sleep(500); // Dateien sind geschlossen
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                cycle(root, id, null, false, true);
            }, "VaultSync-final");
            t.start();
            return t;
        }

        /** Spiel wird geschlossen, die Welt läuft noch: jetzt synchron sichern (maximal timeoutMs warten). */
        public void finalSyncBlocking(long timeoutMs) {
            task.cancel(false);
            if (!cfg.zipEnabled() || !cfg.uploadOnExit) return;
            phase = "Warte auf Minecraft"; progress = 0;
            try { exec.submit(() -> cycle(root, id, hooks, false, true, true)).get(timeoutMs, TimeUnit.MILLISECONDS); }
            catch (Exception e) { log.accept("Sicherung beim Beenden nicht abgeschlossen: " + e); }
        }
    }

    /** Ein Durchlauf; synchron, damit Tests ihn direkt aufrufen können. */
    public void cycle(Path root, String worldId, Hooks hooks, boolean live) { cycle(root, worldId, hooks, live, false); }

    public void cycle(Path root, String worldId, Hooks hooks, boolean live, boolean force) { cycle(root, worldId, hooks, live, force, true); }

    /** @param force alles jetzt erledigen, unabhängig von den Intervallen (manuell / beim Verlassen). */
    public synchronized void cycle(Path root, String worldId, Hooks hooks, boolean live, boolean force, boolean withZip) {
        long now = System.currentTimeMillis();
        boolean doStats = hooks != null && (force || now - lastStatsAttempt >= cfg.intervalMinutes * 60_000L);
        boolean doZip = withZip && cfg.zipEnabled() && (force || now - lastZipAttempt >= cfg.zipIntervalMinutes * 60_000L);
        if (!doStats && !doZip) return;
        boolean exit = force && !live; // Verlassen der Welt bzw. Spiel beenden
        String pre = exit ? EXIT_PREFIX : "";
        boolean notify = force && live, failed = false, any = false;
        String summary = "";
        if (doStats) {
            lastStatsAttempt = now;
            try {
                set(State.SAVING);
                var stats = hooks.collectStats();
                if (stats != null) {
                    List<String> notes = new ArrayList<>();
                    stats = guard.sanitize(stats, notes);
                    notes.forEach(n -> log.accept("Statistik-Schutz: " + n));
                    if (stats == null) {
                        record(STATS, false, 0, pre + "Übersprungen: " + notes.get(0));
                        if (notify) chat.accept("Statistiken nicht gesendet: " + notes.get(0) + " (vermutlich noch nicht geladen).");
                    }
                }
                if (stats != null) {
                    set(State.UPLOADING); progress = 0;
                    long bytes = client.postStats(stats);
                    lastStatsMs = lastSuccessMs = System.currentTimeMillis(); lastStatsBytes = bytes; lastStatsFields = stats.size();
                    record(STATS, true, bytes, pre + stats.size() + " Werte");
                    log.accept("Statistiken gesendet");
                    if (notify) chat.accept("Statistiken gesendet (" + stats.size() + " Werte).");
                    any = true;
                }
            } catch (Exception e) { failed = true; fail(STATS, pre, e, notify); }
        }
        if (doZip) {
            lastZipAttempt = now;
            Path tmp = null; boolean frozen = false;
            try {
                set(State.SAVING); progress = 0; phase = "Welt wird gespeichert";
                if (hooks != null) { hooks.saveAndFreeze(); frozen = true; }
                String fp = WorldZipper.fingerprint(root);
                if (fp.equals(lastFingerprint)) {
                    lastZipMs = lastSuccessMs = System.currentTimeMillis();
                    record(ZIP, true, 0, pre + "unverändert, nichts hochgeladen");
                    summary = "Welt unverändert, nichts Neues hochzuladen.";
                    if (notify) chat.accept("Welt unverändert seit der letzten Sicherung – nichts Neues hochzuladen.");
                    any = true;
                } else {
                    // Platz prüfen, bevor wir gigabyteweise schreiben
                    long worldBytes = WorldZipper.size(root);
                    DiskCheck.requireOn(Path.of(System.getProperty("java.io.tmpdir")), worldBytes);
                    if (!cfg.localBackupDir.isBlank()) DiskCheck.requireOn(Path.of(cfg.localBackupDir), worldBytes);
                    tmp = Files.createTempFile("vaultsync-", ".zip");
                    phase = "Welt wird gepackt"; progress = 0;
                    WorldZipper.zip(root, tmp, p -> progress = p * 0.25);   // Packen = erste 25 %, Upload = der Rest
                    long size = Files.size(tmp);
                    warning = cfg.warnZipMb > 0 && size > cfg.warnZipMb * 1024L * 1024L
                            ? "Die Welt ist " + Fmt.size(size) + " groß. Prüfe, ob dein Dropbox genug Platz hat." : "";
                    if (!warning.isEmpty() && (force ? live : true)) chat.accept("Achtung: " + warning);
                    if (frozen) { hooks.unfreeze(); frozen = false; }
                    String world = root.getFileName().toString();
                    boolean okAll = true;
                    if (!cfg.localBackupDir.isBlank()) {
                        try {
                            Path saved = LocalBackups.store(Path.of(cfg.localBackupDir), world, tmp, cfg.localKeep);
                            record(LOCAL, true, size, pre + saved.getFileName());
                            if (notify) chat.accept("Lokale Kopie gespeichert: " + saved.getFileName());
                        } catch (Exception e) { okAll = false; failed = true; fail(LOCAL, pre, e, notify); }
                    }
                    if (cfg.zipBackup) {
                        set(State.UPLOADING); phase = "Welt wird hochgeladen"; progress = 0.25;
                        // Die Uhrzeit im Titel kommt vom PC (nicht vom Server der Seite), damit sie zur echten Sicherungszeit passt.
                        String label = (exit ? "Beim Verlassen" : "Auto-Sicherung") + " - " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"));
                        client.upload(world, tmp, label, p -> progress = 0.25 + 0.75 * p);
                        record(ZIP, true, size, pre + "hochgeladen");
                        summary = "Welt hochgeladen (" + Fmt.size(size) + ").";
                        log.accept("Welt-ZIP hochgeladen (" + size / 1024 / 1024 + " MB)");
                        if (notify) chat.accept("Welt hochgeladen (" + Math.max(1, size / 1024 / 1024) + " MB).");
                    }
                    if (summary.isEmpty()) summary = "Lokale Kopie gespeichert (" + Fmt.size(size) + ").";
                    if (okAll) { lastFingerprint = fp; }
                    lastZipMs = lastSuccessMs = System.currentTimeMillis(); lastZipBytes = size;
                    any = true;
                    saveState();
                }
            } catch (Exception e) { failed = true; fail(ZIP, pre, e, notify); }
            finally {
                if (frozen) hooks.unfreeze();
                if (tmp != null) try { Files.deleteIfExists(tmp); } catch (Exception ignored) { }
            }
        }
        progress = 0; phase = "";
        set(failed ? State.ERROR : any ? State.DONE : State.IDLE);
        if (exit && (failed || any)) {
            try { exitListener.accept(!failed, failed ? lastError : summary); } catch (RuntimeException e) { log.accept("Meldung beim Verlassen fehlgeschlagen: " + e); }
        }
    }

    private void fail(String kind, String pre, Exception e, boolean notify) {
        lastError = String.valueOf(e.getMessage());
        record(kind, false, 0, pre + lastError);
        log.accept(kind + " fehlgeschlagen: " + e);
        if (notify) chat.accept(kind + " fehlgeschlagen: " + lastError);
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
    }
}
