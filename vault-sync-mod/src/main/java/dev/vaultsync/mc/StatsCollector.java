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
        d.put("analysis_version", 3); // die Seite liest die Welt dann nicht selbst im Browser neu aus
        d.put("world_name", data.getLevelName());
        d.put("mc_version", SharedConstants.getCurrentVersion().name());
        d.put("game_mode", p.gameMode.getGameModeForPlayer().getName());
        d.put("difficulty", data.getDifficulty().name().toLowerCase(java.util.Locale.ROOT));
        d.put("seed", String.valueOf(overworld.getSeed()));
        d.put("dimension", strip(p.level().dimension().identifier()));
        d.put("player_x", Math.round(p.getX() * 10) / 10.0);
        d.put("player_y", Math.round(p.getY() * 10) / 10.0);
        d.put("player_z", Math.round(p.getZ() * 10) / 10.0);
        d.put("xp_level", p.experienceLevel);
        d.put("health", p.getHealth());
        d.put("food_level", p.getFoodData().getFoodLevel());
        d.put("game_time_ticks", overworld.getGameTime());
        d.put("day_time", overworld.getGameTime() % 24000L);
        d.put("weather", overworld.isThundering() ? "thunder" : overworld.isRaining() ? "rain" : "clear");
        d.put("hardcore", data.isHardcore());

        d.put("play_time_ticks", custom(st, Stats.PLAY_TIME));
        d.put("deaths", custom(st, Stats.DEATHS));
        d.put("mob_kills", custom(st, Stats.MOB_KILLS));
        d.put("jumps", custom(st, Stats.JUMP));
        d.put("damage_dealt", Math.round(custom(st, Stats.DAMAGE_DEALT) / 20.0)); // wie die Auslese im Browser: Herzen
        d.put("damage_taken", Math.round(custom(st, Stats.DAMAGE_TAKEN) / 20.0));
        d.put("animals_bred", custom(st, Stats.ANIMALS_BRED));
        d.put("fish_caught", custom(st, Stats.FISH_CAUGHT));
        d.put("villager_trades", custom(st, Stats.TRADED_WITH_VILLAGER));
        d.put("nights_slept", custom(st, Stats.SLEEP_IN_BED));

        long mined = 0, bestMined = 0; String topBlock = null;
        for (Block b : BuiltInRegistries.BLOCK) {
            int v = st.getValue(Stats.BLOCK_MINED.get(b));
            mined += v;
            if (v > bestMined) { bestMined = v; topBlock = pretty(strip(BuiltInRegistries.BLOCK.getKey(b))); }
        }
        long crafted = 0;
        for (Item i : BuiltInRegistries.ITEM) crafted += st.getValue(Stats.ITEM_CRAFTED.get(i));
        int bestKill = 0; String topMob = null;
        for (EntityType<?> t : BuiltInRegistries.ENTITY_TYPE) {
            int v = st.getValue(Stats.ENTITY_KILLED.get(t));
            if (v > bestKill) { bestKill = v; topMob = pretty(strip(BuiltInRegistries.ENTITY_TYPE.getKey(t))); }
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

        List<Map<String, Object>> done = new ArrayList<>();
        List<Map<String, Object>> biomes = new ArrayList<>();
        for (AdvancementHolder a : server.getAdvancements().getAllAdvancements()) {
            var progress = p.getAdvancements().getOrStartProgress(a);
            String path = a.id().getPath();
            if (path.equals("adventure/adventuring_time")) {
                for (String crit : progress.getCompletedCriteria()) {
                    Map<String, Object> e = new LinkedHashMap<>();
                    e.put("id", strip(Identifier.parse(crit)));
                    var when = progress.getCriterion(crit).getObtained();
                    if (when != null) e.put("date", when.toString());
                    biomes.add(e);
                }
            }
            if (!progress.isDone() || path.startsWith("recipes/") || path.endsWith("/root")) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", strip(a.id()));
            java.time.Instant latest = null;
            for (String crit : progress.getCompletedCriteria()) {
                var when = progress.getCriterion(crit).getObtained();
                if (when != null && (latest == null || when.isAfter(latest))) latest = when;
            }
            if (latest != null) e.put("date", latest.toString());
            done.add(e);
        }
        done.sort((x, y) -> String.valueOf(y.get("date")).compareTo(String.valueOf(x.get("date"))));
        biomes.sort((x, y) -> String.valueOf(x.get("date")).compareTo(String.valueOf(y.get("date"))));
        d.put("advancements", done.size());
        d.put("advancement_list", done);
        d.put("biomes", biomes);

        d.put("stats_detail", detail(st));

        d.put("inventory", items(p.getInventory()));
        d.put("ender_items", items(p.getEnderChestInventory()));
        return d;
    }

    /** Detail-Statistiken im gleichen Format wie die Auslese im Browser (je Kategorie die 80 höchsten Werte). */
    private static Map<String, Object> detail(ServerStatsCounter st) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Integer> custom = new HashMap<>();
        for (Identifier id : BuiltInRegistries.CUSTOM_STAT) custom.put(strip(id), st.getValue(Stats.CUSTOM.get(id)));
        out.put("custom", topN(custom, 200));
        Map<String, Integer> m = new HashMap<>();
        for (Block b : BuiltInRegistries.BLOCK) m.put(strip(BuiltInRegistries.BLOCK.getKey(b)), st.getValue(Stats.BLOCK_MINED.get(b)));
        out.put("mined", topN(m, 80));
        String[] names = {"crafted", "used", "broken", "picked_up", "dropped"};
        for (String name : names) {
            m = new HashMap<>();
            for (Item i : BuiltInRegistries.ITEM) {
                var type = switch (name) { case "crafted" -> Stats.ITEM_CRAFTED; case "used" -> Stats.ITEM_USED; case "broken" -> Stats.ITEM_BROKEN;
                    case "picked_up" -> Stats.ITEM_PICKED_UP; default -> Stats.ITEM_DROPPED; };
                m.put(strip(BuiltInRegistries.ITEM.getKey(i)), st.getValue(type.get(i)));
            }
            out.put(name, topN(m, 80));
        }
        Map<String, Integer> killed = new HashMap<>(), killedBy = new HashMap<>();
        for (EntityType<?> t : BuiltInRegistries.ENTITY_TYPE) {
            String key = strip(BuiltInRegistries.ENTITY_TYPE.getKey(t));
            killed.put(key, st.getValue(Stats.ENTITY_KILLED.get(t))); killedBy.put(key, st.getValue(Stats.ENTITY_KILLED_BY.get(t)));
        }
        out.put("killed", topN(killed, 80));
        out.put("killed_by", topN(killedBy, 80));
        return out;
    }

    /** Die Seite erwartet Namen ohne "minecraft:". */
    static String strip(Identifier id) { return id.getNamespace().equals("minecraft") ? id.getPath() : id.toString(); }

    private static String pretty(String id) {
        String n = id.replace('_', ' ');
        return n.isEmpty() ? n : Character.toUpperCase(n.charAt(0)) + n.substring(1);
    }

    /** Die höchsten n Einträge, absteigend (wie die Auslese im Browser). */
    private static Map<String, Object> topN(Map<String, Integer> m, int n) {
        Map<String, Object> out = new LinkedHashMap<>();
        m.entrySet().stream().filter(e -> e.getValue() > 0).sorted((a, b) -> b.getValue() - a.getValue()).limit(n)
                .forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    private static int custom(ServerStatsCounter st, Identifier id) { return st.getValue(Stats.CUSTOM.get(id)); }

    private static List<Map<String, Object>> items(Container inv) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (s.isEmpty()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("slot", i); m.put("id", strip(BuiltInRegistries.ITEM.getKey(s.getItem()))); m.put("count", s.getCount());
            out.add(m);
        }
        return out;
    }
}
