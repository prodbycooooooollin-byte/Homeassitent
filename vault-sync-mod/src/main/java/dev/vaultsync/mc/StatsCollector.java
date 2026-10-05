package dev.vaultsync.mc;

import net.minecraft.SharedConstants;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.ServerStatsCounter;
import net.minecraft.stats.Stats;
import net.minecraft.world.Container;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;

import java.util.*;

/** Sammelt die worldSync-Felder; MUSS auf dem Server-Thread laufen. */
final class StatsCollector {
    private StatsCollector() { }

    static Map<String, Object> collect(MinecraftServer server) {
        var players = server.getPlayerList().getPlayers();
        if (players.isEmpty()) return null;
        ServerPlayer p = players.get(0);
        ServerLevel overworld = server.overworld();
        ServerStatsCounter st = p.getStats();
        var data = server.getWorldData();

        Map<String, Object> d = new LinkedHashMap<>();
        d.put("world_name", data.getLevelName());
        d.put("mc_version", SharedConstants.getCurrentVersion().name());
        d.put("game_mode", p.gameMode.getGameModeForPlayer().getName());
        d.put("difficulty", data.getDifficulty().getKey());
        d.put("seed", overworld.getSeed());
        d.put("dimension", p.level().dimension().identifier().toString());
        d.put("player_x", Math.round(p.getX() * 10) / 10.0);
        d.put("player_y", Math.round(p.getY() * 10) / 10.0);
        d.put("player_z", Math.round(p.getZ() * 10) / 10.0);
        d.put("xp_level", p.experienceLevel);
        d.put("health", p.getHealth());
        d.put("food_level", p.getFoodData().getFoodLevel());
        d.put("game_time_ticks", overworld.getGameTime());
        d.put("day_time", overworld.getDayTime());
        d.put("weather", overworld.isThundering() ? "thunder" : overworld.isRaining() ? "rain" : "clear");
        d.put("hardcore", data.isHardcore());

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
        for (Block b : BuiltInRegistries.BLOCK) {
            int v = st.getValue(Stats.BLOCK_MINED.get(b));
            mined += v;
            if (v > bestMined) { bestMined = v; topBlock = BuiltInRegistries.BLOCK.getKey(b).toString(); }
        }
        long crafted = 0;
        for (Item i : BuiltInRegistries.ITEM) crafted += st.getValue(Stats.ITEM_CRAFTED.get(i));
        int bestKill = 0; String topMob = null;
        for (EntityType<?> t : BuiltInRegistries.ENTITY_TYPE) {
            int v = st.getValue(Stats.ENTITY_KILLED.get(t));
            if (v > bestKill) { bestKill = v; topMob = BuiltInRegistries.ENTITY_TYPE.getKey(t).toString(); }
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
        for (AdvancementHolder a : server.getAdvancements().getAllAdvancements())
            if (p.getAdvancements().getOrStartProgress(a).isDone() && !a.id().getPath().startsWith("recipes/")) done.add(a.id().toString());
        d.put("advancements", done.size());
        d.put("advancement_list", done);

        d.put("inventory", items(p.getInventory()));
        d.put("ender_items", items(p.getEnderChestInventory()));
        return d;
    }

    private static int custom(ServerStatsCounter st, Identifier id) { return st.getValue(Stats.CUSTOM.get(id)); }

    private static List<Map<String, Object>> items(Container inv) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (s.isEmpty()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("slot", i); m.put("id", BuiltInRegistries.ITEM.getKey(s.getItem()).toString()); m.put("count", s.getCount());
            out.add(m);
        }
        return out;
    }
}
