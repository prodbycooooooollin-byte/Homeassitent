package dev.vaultsync.mc;

import dev.vaultsync.core.Config;
import dev.vaultsync.core.SyncEngine;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.components.toasts.SystemToast;
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
    private static final SystemToast.SystemToastId EXIT_TOAST = new SystemToast.SystemToastId(9000L);
    private SyncEngine engine;
    private SyncEngine.Session session;
    private Path activeRoot;
    private Config config;
    private volatile boolean openRequested;
    private Path configFile;
    private String folder = "";
    private MinecraftServer activeServer;

    @Override public void onInitializeClient() {
        try {
            configFile = FabricLoader.getInstance().getConfigDir().resolve("vaultsync.properties");
            config = Config.load(configFile);
        } catch (Exception e) { LOG.error("Konfiguration nicht lesbar", e); return; }
        engine = new SyncEngine(config, LOG::info);
        engine.setChat(msg -> net.minecraft.client.Minecraft.getInstance().execute(() -> {
            var player = net.minecraft.client.Minecraft.getInstance().player;
            if (player != null) player.sendSystemMessage(net.minecraft.network.chat.Component.literal("[Vault] " + msg));
        }));
        // Ergebnis der Sicherung beim Verlassen als Meldung oben rechts – auch auf dem Titelbildschirm sichtbar
        engine.setExitListener((ok, msg) -> {
            if (!config.exitToast) return;
            net.minecraft.client.Minecraft mc = net.minecraft.client.Minecraft.getInstance();
            mc.execute(() -> SystemToast.addOrUpdate(mc.getToastManager(), EXIT_TOAST,
                    net.minecraft.network.chat.Component.literal(ok ? "Vault: Welt gesichert" : "Vault: Sicherung fehlgeschlagen"),
                    net.minecraft.network.chat.Component.literal(msg)));
        });
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) ->
                VaultCommands.register(dispatcher, () -> openRequested = true));
        HudElementRegistry.attachElementAfter(VanillaHudElements.MISC_OVERLAYS,
                Identifier.fromNamespaceAndPath("vaultsync", "status"), new VaultHud(engine, config));
        // Taste V öffnet das Kontrollzentrum (in den Steuerungs-Einstellungen änderbar)
        KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath("vaultsync", "main"));
        KeyMapping openKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.vaultsync.open", InputConstants.KEY_V, category));
        // Spiel wird mit laufender Welt geschlossen: noch synchron sichern, solange der Server läuft
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> { if (session != null) session.finalSyncBlocking(180_000); });
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (openKey.consumeClick()) openRequested = true;
            if (openRequested) { openRequested = false; client.setScreenAndShow(new VaultScreen(engine, config, actions())); } // erst im nächsten Tick, sonst schließt der Chat es wieder
            MinecraftServer server = client.getSingleplayerServer();
            Path root = server == null || !server.isRunning() ? null
                    : server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
            if (root == null ? activeRoot == null : root.equals(activeRoot)) return;
            if (session != null) {
                MinecraftServer old = activeServer;
                session.stop(old == null ? null : old::isStopped); // wartet im Hintergrund, bis der Server fertig gespeichert hat
                session = null; activeRoot = null; activeServer = null;
            }
            if (root == null) return;
            folder = root.getFileName().toString();
            activeRoot = root;
            if (!config.watched.contains(folder) && !config.worlds.containsKey(folder) || config.apiKey.isEmpty()) return; // nicht eingetragen → nichts tun
            String worldId = config.worlds.getOrDefault(folder, folder);
            activeServer = server;
            session = engine.start(root, worldId, new MinecraftHooks(server),
                    FabricLoader.getInstance().getConfigDir().resolve("vaultsync").resolve(folder.replaceAll("[\\\\/:*?\"<>|]", "_") + ".state"));
            LOG.info("Sicherung aktiv für Welt '{}' alle {} Min.", folder, config.intervalMinutes);
        });
    }

    private VaultScreen.Actions actions() {
        return new VaultScreen.Actions() {
            public SyncEngine.Session session() { return session; }
            public String worldFolder() { return folder; }
            public void save() { try { config.save(configFile); } catch (Exception e) { LOG.error("Config nicht speicherbar", e); } }
            public void addCurrentWorld() {
                if (folder.isEmpty() || config.apiKey.isEmpty()) return;
                config.watched.add(folder); save(); activeRoot = null; // Tick-Handler startet die Sicherung
            }
        };
    }
}
