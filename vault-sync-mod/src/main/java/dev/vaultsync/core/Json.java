package dev.vaultsync.core;

import java.util.Collection;
import java.util.Map;

/** Minimaler JSON-Schreiber (Map/List/String/Zahl/Boolean/null), damit der Kern ohne Bibliotheken auskommt. */
public final class Json {
    private Json() { }

    public static String write(Object o) { StringBuilder sb = new StringBuilder(); put(sb, o); return sb.toString(); }

    private static void put(StringBuilder sb, Object o) {
        if (o == null) sb.append("null");
        else if (o instanceof Boolean || o instanceof Integer || o instanceof Long || o instanceof Short || o instanceof Byte) sb.append(o);
        else if (o instanceof Number n) {
            double d = n.doubleValue();
            sb.append(Double.isFinite(d) ? (d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf((long) d) : String.valueOf(d)) : "null");
        } else if (o instanceof Map<?, ?> m) {
            sb.append('{'); boolean first = true;
            for (var e : m.entrySet()) { if (!first) sb.append(','); first = false; str(sb, String.valueOf(e.getKey())); sb.append(':'); put(sb, e.getValue()); }
            sb.append('}');
        } else if (o instanceof Collection<?> c) {
            sb.append('['); boolean first = true;
            for (Object x : c) { if (!first) sb.append(','); first = false; put(sb, x); }
            sb.append(']');
        } else str(sb, o.toString());
    }

    private static void str(StringBuilder sb, String s) {
        sb.append('"');
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"' -> sb.append("\\\""); case '\\' -> sb.append("\\\\"); case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r"); case '\t' -> sb.append("\\t");
                default -> { if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch); }
            }
        }
        sb.append('"');
    }
}
