import "server-only";
import net from "node:net";

const PACKET_AUTH = 3;
const PACKET_EXEC_COMMAND = 2;
const PACKET_AUTH_RESPONSE = 2;

function buildPacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  // Layout: [length:i32LE][id:i32LE][type:i32LE][body...][0x00][0x00]
  const packet = Buffer.alloc(4 + 4 + 4 + bodyBuf.length + 2);
  let offset = 4;
  packet.writeInt32LE(id, offset);
  offset += 4;
  packet.writeInt32LE(type, offset);
  offset += 4;
  bodyBuf.copy(packet, offset);
  offset += bodyBuf.length;
  packet.writeUInt8(0, offset);
  packet.writeUInt8(0, offset + 1);
  packet.writeInt32LE(packet.length - 4, 0);
  return packet;
}

interface ParsedPacket {
  id: number;
  type: number;
  body: string;
}

/**
 * Führt GENAU EINEN RCON-Befehl aus (Auth + Command + Antwort), dann wird
 * die Verbindung geschlossen. Reicht für Verbindungstests, "list" oder
 * einzelne "tellraw"-Bestätigungen. Minecraft fragmentiert Antworten für
 * diese Anwendungsfälle nicht über mehrere Pakete, daher wird hier bewusst
 * kein Mehrpaket-Reassembly (Terminator-Trick) implementiert.
 */
export function runRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let settled = false;
    const authId = 1;
    const commandId = 2;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const succeed = (body: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(body);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => fail(new Error("Zeitüberschreitung bei der RCON-Verbindung.")));
    socket.once("error", (err) => fail(new Error(`RCON-Verbindungsfehler: ${err.message}`)));
    socket.once("close", () => {
      if (!settled) fail(new Error("RCON-Verbindung wurde unerwartet geschlossen."));
    });

    socket.connect(port, host, () => {
      socket.write(buildPacket(authId, PACKET_AUTH, password));
    });

    function tryParseOne(): ParsedPacket | null {
      if (buffer.length < 4) return null;
      const length = buffer.readInt32LE(0);
      if (buffer.length < 4 + length) return null;
      const id = buffer.readInt32LE(4);
      const type = buffer.readInt32LE(8);
      const body = buffer.subarray(12, 4 + length - 2).toString("utf8");
      buffer = buffer.subarray(4 + length);
      return { id, type, body };
    }

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let packet: ParsedPacket | null;
      while ((packet = tryParseOne())) {
        if (!authenticated) {
          // Minecraft schickt vor der eigentlichen Auth-Antwort mitunter ein
          // leeres SERVERDATA_RESPONSE_VALUE-Paket - das wird hier ignoriert.
          if (packet.type === PACKET_AUTH_RESPONSE) {
            if (packet.id === -1) {
              return fail(new Error("RCON-Authentifizierung fehlgeschlagen (falsches Passwort)."));
            }
            authenticated = true;
            socket.write(buildPacket(commandId, PACKET_EXEC_COMMAND, command));
          }
          continue;
        }
        if (packet.id === commandId) {
          succeed(packet.body);
        }
      }
    });
  });
}
