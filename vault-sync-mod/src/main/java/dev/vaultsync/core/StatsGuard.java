package dev.vaultsync.core;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Schützt vor Messfehlern: Zähler wie Tode, Spielzeit oder abgebaute Blöcke sinken im Spiel nie auf 0.
 * Fällt ein Wert plötzlich auf 0, obwohl er vorher größer war, wird der alte Wert gehalten; sind es mehrere (oder die Spielzeit),
 * gilt die ganze Messung als unbrauchbar und wird nicht gesendet. Niedrigere, aber echte Werte (z. B. nach dem Zurückspielen
 * einer älteren Sicherung) bleiben erlaubt.
 */
public final class StatsGuard {
    public static final List<String> COUNTERS = List.of("play_time_ticks", "deaths", "mob_kills", "blocks_mined", "items_crafted", "distance_km", "advancements");
    private final Map<String, Double> last = new HashMap<>();

    public synchronized void clear() { last.clear(); }
    public synchronized void remember(String key, double v) { last.put(key, v); }
    public synchronized Map<String, Double> snapshot() { return new LinkedHashMap<>(last); }

    private static Double num(Object o) { return o instanceof Number n ? n.doubleValue() : null; }

    /**
     * @param notes bekommt Hinweise, was korrigiert wurde
     * @return bereinigte Statistik, oder {@code null}, wenn die Messung unbrauchbar ist
     */
    public synchronized Map<String, Object> sanitize(Map<String, Object> stats, List<String> notes) {
        List<String> zeroed = new java.util.ArrayList<>();
        for (String k : COUNTERS) {
            Double v = num(stats.get(k)), before = last.get(k);
            if (v != null && v == 0 && before != null && before > 0) zeroed.add(k);
        }
        boolean playtimeLost = zeroed.contains("play_time_ticks");
        if (playtimeLost || zeroed.size() >= 3) {
            notes.add("Messung verworfen: " + String.join(", ", zeroed) + " plötzlich 0");
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>(stats);
        for (String k : zeroed) { out.put(k, last.get(k) % 1 == 0 ? (Object) last.get(k).longValue() : last.get(k)); notes.add(k + " fiel auf 0, alter Wert gehalten"); }
        for (String k : COUNTERS) { Double v = num(out.get(k)); if (v != null) last.put(k, v); }
        return out;
    }
}
