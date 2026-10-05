package dev.vaultsync.mc;

import com.mojang.brigadier.CommandDispatcher;
import dev.vaultsync.core.Config;
import dev.vaultsync.core.SyncEngine;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.network.chat.Component;

import java.util.function.Supplier;

/** /vault sync | status | pause | resume | reload */
final class VaultCommands {
    interface Reload { String run() throws Exception; }

    private VaultCommands() { }

    static void register(CommandDispatcher<FabricClientCommandSource> d, SyncEngine engine, Config cfg,
                         Supplier<SyncEngine.Session> session, Reload reload) {
        d.register(ClientCommands.literal("vault")
                .executes(c -> say(c.getSource(), "/vault sync | status | pause | resume | reload"))
                .then(ClientCommands.literal("sync").executes(c -> {
                    var s = session.get();
                    if (s == null) return say(c.getSource(), "Keine aktive Sicherung: Welt nicht in 'worlds' eingetragen oder apiKey fehlt.");
                    s.syncNow();
                    return say(c.getSource(), "Sicherung gestartet …");
                }))
                .then(ClientCommands.literal("status").executes(c -> say(c.getSource(), status(engine, cfg, session.get() != null))))
                .then(ClientCommands.literal("pause").executes(c -> { engine.setPaused(true); return say(c.getSource(), "Automatische Sicherung pausiert."); }))
                .then(ClientCommands.literal("resume").executes(c -> { engine.setPaused(false); return say(c.getSource(), "Automatische Sicherung läuft wieder."); }))
                .then(ClientCommands.literal("reload").executes(c -> {
                    try { return say(c.getSource(), reload.run()); }
                    catch (Exception e) { return say(c.getSource(), "Config nicht lesbar: " + e.getMessage()); }
                })));
    }

    static String status(SyncEngine e, Config cfg, boolean active) {
        StringBuilder sb = new StringBuilder();
        sb.append(active ? "Aktiv" : "Nicht aktiv (Welt nicht eingetragen oder apiKey fehlt)")
          .append(e.paused() ? ", pausiert" : "").append(" · alle ").append(cfg.intervalMinutes).append(" Min. · Status: ").append(e.state());
        long t = e.lastSuccessMs();
        sb.append(" · zuletzt erfolgreich: ").append(t == 0 ? "noch nie" : "vor " + (System.currentTimeMillis() - t) / 1000 + " s");
        if (e.state() == SyncEngine.State.ERROR) sb.append(" · Fehler: ").append(e.lastError());
        return sb.toString();
    }

    private static int say(FabricClientCommandSource src, String msg) {
        src.sendFeedback(Component.literal("[Vault] " + msg));
        return 1;
    }
}
