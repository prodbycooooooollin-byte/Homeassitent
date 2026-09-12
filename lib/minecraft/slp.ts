import "server-only";
import net from "node:net";
import { encodeVarInt, encodeString, tryReadVarInt } from "@/lib/minecraft/varint";

export interface SlpPlayerSample {
  name: string;
  id: string;
}

export interface SlpResult {
  motd: string;
  versionName: string;
  protocol: number;
  playersOnline: number;
  playersMax: number;
  sample: SlpPlayerSample[];
  latencyMs: number;
  favicon?: string;
}

/** Chat-Komponenten (MOTD) können verschachtelte Objekte mit Formatierung
 * sein - hier wird nur der reine Text extrahiert, keine Farbcodes gerendert. */
function flattenChatComponent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenChatComponent).join("");
  if (typeof value === "object") {
    const obj = value as { text?: unknown; extra?: unknown[] };
    let out = typeof obj.text === "string" ? obj.text : "";
    if (Array.isArray(obj.extra)) out += obj.extra.map(flattenChatComponent).join("");
    return out;
  }
  return String(value);
}

/**
 * Server List Ping (modernes Handshake-Protokoll, Minecraft ≥ 1.7). Braucht
 * keinerlei Zugangsdaten oder Connector - funktioniert gegen jeden
 * erreichbaren Java-Server. Liefert nur das, was das Protokoll hergibt:
 * Online-Status, MOTD, Spielerzahl/-limit, Versionstext, ggf. eine
 * Spieler-Stichprobe (kein zuverlässiges Full-Roster).
 */
export function pingServer(host: string, port: number, timeoutMs = 5000): Promise<SlpResult> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let settled = false;
    const startedAt = Date.now();

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const succeed = (result: SlpResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => fail(new Error("Zeitüberschreitung bei der Verbindung zum Server.")));
    socket.once("error", (err) => fail(err));
    socket.once("close", () => fail(new Error("Verbindung wurde ohne Antwort geschlossen.")));

    socket.connect(port, host, () => {
      // Handshake-Paket (ID 0x00): Protokollversion, Host, Port, nextState=1 (Status)
      const handshakePayload = Buffer.concat([
        encodeVarInt(767), // Protokollversion "Wunsch" - Server antwortet mit seiner eigenen Versionsnummer
        encodeString(host),
        (() => {
          const b = Buffer.alloc(2);
          b.writeUInt16BE(port, 0);
          return b;
        })(),
        encodeVarInt(1),
      ]);
      function framePacket(packetId: number, payload: Buffer): Buffer {
        const body = Buffer.concat([encodeVarInt(packetId), payload]);
        return Buffer.concat([encodeVarInt(body.length), body]);
      }

      const handshake = framePacket(0x00, handshakePayload);
      const statusRequest = framePacket(0x00, Buffer.alloc(0));
      socket.write(Buffer.concat([handshake, statusRequest]));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      const lengthInfo = tryReadVarInt(buffer);
      if (!lengthInfo) return; // mehr Daten abwarten
      const totalPacketLength = lengthInfo.value;
      const packetStart = lengthInfo.bytesRead;
      if (buffer.length < packetStart + totalPacketLength) return; // mehr Daten abwarten

      const packet = buffer.subarray(packetStart, packetStart + totalPacketLength);
      const idInfo = tryReadVarInt(packet);
      if (!idInfo) return fail(new Error("Ungültiges Antwortpaket vom Server."));
      const jsonLenInfo = tryReadVarInt(packet.subarray(idInfo.bytesRead));
      if (!jsonLenInfo) return fail(new Error("Ungültiges Antwortpaket vom Server."));
      const jsonStart = idInfo.bytesRead + jsonLenInfo.bytesRead;
      const jsonBuf = packet.subarray(jsonStart, jsonStart + jsonLenInfo.value);

      let parsed: {
        version?: { name?: string; protocol?: number };
        players?: { max?: number; online?: number; sample?: SlpPlayerSample[] };
        description?: unknown;
        favicon?: string;
      };
      try {
        parsed = JSON.parse(jsonBuf.toString("utf8"));
      } catch {
        return fail(new Error("Antwort des Servers konnte nicht gelesen werden (kein gültiges JSON)."));
      }

      succeed({
        motd: flattenChatComponent(parsed.description).trim(),
        versionName: parsed.version?.name ?? "unbekannt",
        protocol: parsed.version?.protocol ?? -1,
        playersOnline: parsed.players?.online ?? 0,
        playersMax: parsed.players?.max ?? 0,
        sample: parsed.players?.sample ?? [],
        latencyMs: Date.now() - startedAt,
        favicon: parsed.favicon,
      });
    });
  });
}
