package dev.vaultsync.mc;

import dev.vaultsync.core.Config;
import dev.vaultsync.core.SyncEngine;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

public final class VaultSyncClient implements ClientModInitializer {
    static final Logger LOG = LoggerFactory.getLogger("VaultSync");
    private SyncEngine engine;
    private SyncEngine.Session session;
    private Path activeRoot;
    private Config config;

    @Override public void onInitializeClient() {
        try {
            config = Config.load(FabricLoader.getInstance().getConfigDir().resolve("vaultsync.properties"));
        } catch (Exception e) { LOG.error("Konfiguration nicht lesbar", e); return; }
        engine = new SyncEngine(config, LOG::info);
        engine.setChat(msg -> net.minecraft.client.Minecraft.getInstance().execute(() -> {
            var player = net.minecraft.client.Minecraft.getInstance().player;
            if (player != null) player.sendSystemMessage(net.minecraft.network.chat.Component.literal("[Vault] " + msg));
        }));
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) ->
                VaultCommands.register(dispatcher, engine, config, () -> session, this::reloadConfig));
        HudElementRegistry.attachElementAfter(VanillaHudElements.MISC_OVERLAYS,
                Identifier.fromNamespaceAndPath("vaultsync", "status"), new VaultHud(engine));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            MinecraftServer server = client.getSingleplayerServer();
            Path root = server == null || !server.isRunning() ? null
                    : server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
            if (root == null ? activeRoot == null : root.equals(activeRoot)) return;
            if (session != null) { session.stop(); session = null; activeRoot = null; }
            if (root == null) return;
            String folder = root.getFileName().toString();
            activeRoot = root;
            if (!config.watched.contains(folder) && !config.worlds.containsKey(folder) || config.apiKey.isEmpty()) return; // nicht eingetragen → nichts tun
            String worldId = config.worlds.getOrDefault(folder, folder);
            session = engine.start(root, worldId, new MinecraftHooks(server));
            LOG.info("Sicherung aktiv für Welt '{}' alle {} Min.", folder, config.intervalMinutes);
        });
    }

    /** /vault reload: Config neu lesen und die aktuelle Welt neu bewerten. */
    private String reloadConfig() throws Exception {
        config.copyFrom(Config.load(FabricLoader.getInstance().getConfigDir().resolve("vaultsync.properties")));
        if (session != null) { session.stop(); session = null; }
        activeRoot = null; // Tick-Handler entscheidet neu
        return "Config neu geladen (" + config.watched.size() + " Welt(en) eingetragen).";
    }
}
