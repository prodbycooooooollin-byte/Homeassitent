package dev.vaultsync.mc;

import net.minecraft.SharedConstants;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.block.Block;
import net.minecraft.entity.EntityType;
import net.minecraft.inventory.Inventory;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.stat.ServerStatHandler;
import net.minecraft.stat.Stat;
import net.minecraft.stat.Stats;
import net.minecraft.util.Identifier;

import java.util.*;

/** Sammelt die worldSync-Felder; MUSS auf dem Server-Thread laufen. */
final class StatsCollector {
    private StatsCollector() { }

    static Map<String, Object> collect(MinecraftServer server) {
        var players = server.getPlayerManager().getPlayerList();
        if (players.isEmpty()) return null;
        ServerPlayerEntity p = players.get(0);
        ServerWorld overworld = server.getOverworld();
        ServerStatHandler st = p.getStatHandler();
        var props = server.getSaveProperties();

        Map<String, Object> d = new LinkedHashMap<>();
        d.put("world_name", props.getLevelName());
        d.put("mc_version", SharedConstants.getGameVersion().getName());
        d.put("game_mode", p.interactionManager.getGameMode().getName());
        d.put("difficulty", props.getDifficulty().getName());
        d.put("seed", overworld.getSeed());
        d.put("dimension", p.getWorld().getRegistryKey().getValue().toString());
        d.put("player_x", Math.round(p.getX() * 10) / 10.0);
        d.put("player_y", Math.round(p.getY() * 10) / 10.0);
        d.put("player_z", Math.round(p.getZ() * 10) / 10.0);
        d.put("spawn_x", overworld.getSpawnPos().getX());
        d.put("spawn_z", overworld.getSpawnPos().getZ());
        d.put("xp_level", p.experienceLevel);
        d.put("health", p.getHealth());
        d.put("food_level", p.getHungerManager().getFoodLevel());
        d.put("game_time_ticks", overworld.getTime());
        d.put("day_time", overworld.getTimeOfDay());
        d.put("weather", overworld.isThundering() ? "thunder" : overworld.isRaining() ? "rain" : "clear");
        d.put("hardcore", props.isHardcore());
        d.put("allow_commands", props.areCommandsAllowed());

        d.put("play_time_ticks", custom(st, Stats.PLAY_TIME));
        d.put("deaths", custom(st, Stats.DEATHS));
        d.put("mob_kills", custom(st, Stats.MOB_KILLS));
        d.put("jumps", custom(st, Stats.JUMP));
        d.put("damage_dealt", custom(st, Stats.DAMAGE_DEALT));
        d.put("damage_taken", custom(st, Stats.DAMAGE_TAKEN));
        d.put("animals_bred", custom(st, Stats.ANIMALS_BRED));
        d.put("fish_caught", custom(st, Stats.FISH_CAUGHT));
        d.put("villager_trades", custom(st, Stats.TRADED_WITH_VILLAGER));
        d.put("nights_slept", custom(st, Stats.SLEEP_IN_BED));

        long mined = 0, bestMined = 0; String topBlock = null;
        for (Block b : Registries.BLOCK) {
            int v = st.getStat(Stats.MINED.getOrCreateStat(b));
            mined += v;
            if (v > bestMined) { bestMined = v; topBlock = Registries.BLOCK.getId(b).toString(); }
        }
        long crafted = 0;
        for (Item i : Registries.ITEM) crafted += st.getStat(Stats.CRAFTED.getOrCreateStat(i));
        int bestKill = 0; String topMob = null;
        for (EntityType<?> t : Registries.ENTITY_TYPE) {
            int v = st.getStat(Stats.KILLED.getOrCreateStat(t));
            if (v > bestKill) { bestKill = v; topMob = Registries.ENTITY_TYPE.getId(t).toString(); }
        }
        long cm = 0;
        for (Identifier id : List.of(Stats.WALK_ONE_CM, Stats.SPRINT_ONE_CM, Stats.CROUCH_ONE_CM, Stats.SWIM_ONE_CM,
                Stats.FLY_ONE_CM, Stats.BOAT_ONE_CM, Stats.HORSE_ONE_CM, Stats.MINECART_ONE_CM, Stats.AVIATE_ONE_CM,
                Stats.WALK_ON_WATER_ONE_CM, Stats.WALK_UNDER_WATER_ONE_CM, Stats.PIG_ONE_CM, Stats.STRIDER_ONE_CM))
            cm += custom(st, id);
        d.put("blocks_mined", mined);
        d.put("items_crafted", crafted);
        d.put("distance_km", Math.round(cm / 1000.0) / 100.0);
        if (topBlock != null) d.put("top_block", topBlock);
        if (topMob != null) d.put("top_mob", topMob);

        List<String> done = new ArrayList<>();
        for (AdvancementEntry a : server.getAdvancementLoader().getAdvancements())
            if (p.getAdvancementTracker().getProgress(a).isDone() && !a.id().getPath().startsWith("recipes/")) done.add(a.id().toString());
        d.put("advancements", done.size());
        d.put("advancement_list", done);

        Map<String, Object> rules = new LinkedHashMap<>();
        NbtCompound nbt = server.getGameRules().toNbt();
        for (String k : nbt.getKeys()) rules.put(k, nbt.getString(k));
        d.put("game_rules", rules);

        d.put("inventory", items(p.getInventory()));
        d.put("ender_items", items(p.getEnderChestInventory()));
        return d;
    }

    private static int custom(ServerStatHandler st, Identifier id) {
        Stat<Identifier> s = Stats.CUSTOM.getOrCreateStat(id);
        return st.getStat(s);
    }

    private static List<Map<String, Object>> items(Inventory inv) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < inv.size(); i++) {
            ItemStack s = inv.getStack(i);
            if (s.isEmpty()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("slot", i); m.put("id", Registries.ITEM.getId(s.getItem()).toString()); m.put("count", s.getCount());
            out.add(m);
        }
        return out;
    }
}
