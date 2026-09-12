// VarInt-Kodierung wie vom Minecraft-Protokoll verwendet (7 Nutzbits pro
// Byte, oberstes Bit = "es folgt noch ein Byte"). Siehe wiki.vg/Protocol.

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let temp = v & 0b0111_1111;
    v >>>= 7;
    if (v !== 0) temp |= 0b1000_0000;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

export function encodeString(value: string): Buffer {
  const strBuf = Buffer.from(value, "utf8");
  return Buffer.concat([encodeVarInt(strBuf.length), strBuf]);
}

/**
 * Versucht, am Anfang von `buf` einen VarInt zu lesen. Gibt null zurück,
 * wenn noch nicht genug Bytes vorliegen (Aufrufer soll auf mehr Daten warten).
 */
export function tryReadVarInt(buf: Buffer): { value: number; bytesRead: number } | null {
  let value = 0;
  let position = 0;
  for (let i = 0; i < 5; i++) {
    if (i >= buf.length) return null;
    const byte = buf[i];
    value |= (byte & 0b0111_1111) << position;
    if ((byte & 0b1000_0000) === 0) {
      return { value: value >>> 0, bytesRead: i + 1 };
    }
    position += 7;
  }
  throw new Error("VarInt ist zu lang (>5 Bytes).");
}
