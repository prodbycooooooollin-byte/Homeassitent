// Minimaler RCON-Client (Source-RCON-Protokoll, von Minecraft verwendet).
// Öffnet pro Aufruf eine frische Verbindung, authentifiziert sich und führt
// eine Liste von Befehlen sequenziell aus - robuster als eine dauerhafte
// Verbindung, die nach einem Serverneustart hängen bleiben könnte.
import net from "node:net";

const PACKET_AUTH = 3;
const PACKET_EXEC_COMMAND = 2;
const PACKET_AUTH_RESPONSE = 2;

function buildPacket(id, type, body) {
  const bodyBuf = Buffer.from(body, "utf8");
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

/**
 * Führt eine Liste von RCON-Befehlen in einer Sitzung aus und gibt die
 * Antworten in derselben Reihenfolge zurück.
 */
export function runRconCommands(host, port, password, commands, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let commandIndex = 0;
    const responses = [];
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(responses);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => fail(new Error("RCON-Zeitüberschreitung.")));
    socket.once("error", (err) => fail(new Error(`RCON-Verbindungsfehler: ${err.message}`)));
    socket.once("close", () => {
      if (!settled) fail(new Error("RCON-Verbindung unerwartet geschlossen."));
    });

    socket.connect(port, host, () => {
      socket.write(buildPacket(0, PACKET_AUTH, password));
    });

    function sendNextCommand() {
      if (commandIndex >= commands.length) {
        succeed();
        return;
      }
      socket.write(buildPacket(commandIndex + 1, PACKET_EXEC_COMMAND, commands[commandIndex]));
    }

    function tryParseOne() {
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
      let packet;
      while ((packet = tryParseOne())) {
        if (!authenticated) {
          if (packet.type === PACKET_AUTH_RESPONSE) {
            if (packet.id === -1) return fail(new Error("RCON-Authentifizierung fehlgeschlagen."));
            authenticated = true;
            sendNextCommand();
          }
          continue;
        }
        if (packet.id === commandIndex + 1) {
          responses.push(packet.body);
          commandIndex += 1;
          sendNextCommand();
        }
      }
    });
  });
}
