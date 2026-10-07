package dev.vaultsync.mc;

import com.mojang.brigadier.CommandDispatcher;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;

/** /vault öffnet das Dashboard. */
final class VaultCommands {
    private VaultCommands() { }

    static void register(CommandDispatcher<FabricClientCommandSource> d, Runnable openDashboard) {
        d.register(ClientCommands.literal("vault").executes(c -> { openDashboard.run(); return 1; }));
    }
}
