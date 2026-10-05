package dev.vaultsync.mc;

import dev.vaultsync.core.SyncEngine;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Speichert auf dem Server-Thread und pausiert das Chunk-Schreiben, solange die Dateien kopiert werden. */
final class MinecraftHooks implements SyncEngine.Hooks {
    private final MinecraftServer server;
    MinecraftHooks(MinecraftServer server) { this.server = server; }

    @Override public java.util.Map<String, Object> collectStats() throws Exception {
        CompletableFuture<java.util.Map<String, Object>> f = new CompletableFuture<>();
        server.execute(() -> { try { f.complete(StatsCollector.collect(server)); } catch (Throwable t) { f.completeExceptionally(t); } });
        return f.get(30, TimeUnit.SECONDS);
    }

    @Override public void saveAndFreeze() throws Exception {
        CompletableFuture<Void> done = new CompletableFuture<>();
        server.execute(() -> {
            try {
                server.saveEverything(true, true, true);
                for (ServerLevel w : server.getAllLevels()) w.noSave = true;
                done.complete(null);
            } catch (Throwable t) { done.completeExceptionally(t); }
        });
        done.get(60, TimeUnit.SECONDS);
    }

    @Override public void unfreeze() {
        server.execute(() -> { for (ServerLevel w : server.getAllLevels()) w.noSave = false; });
    }
}
