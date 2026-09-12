import fs from "node:fs";
import path from "node:path";

export function getLogPath(serverDir) {
  return path.join(serverDir, "logs", "latest.log");
}

/**
 * Liest neu angehängte, VOLLSTÄNDIGE Zeilen seit state.logOffset. Bricht bei
 * einer unvollständigen letzten Zeile ab (sie wird beim nächsten Aufruf
 * erneut - dann vollständig - gelesen), erkennt Log-Rotation (Dateigröße
 * kleiner als der gespeicherte Offset) und setzt dann von vorn auf.
 */
export function readNewLines(logPath, state) {
  if (!fs.existsSync(logPath)) return [];

  const { size } = fs.statSync(logPath);
  if (size < state.logOffset) {
    state.logOffset = 0; // Logrotation erkannt
  }
  if (size === state.logOffset) return [];

  const fd = fs.openSync(logPath, "r");
  const length = size - state.logOffset;
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, state.logOffset);
  fs.closeSync(fd);

  const text = buffer.toString("utf8");
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1) return []; // noch keine vollständige Zeile

  const complete = text.slice(0, lastNewline);
  state.logOffset += Buffer.byteLength(complete, "utf8") + 1;

  return complete.split("\n").filter((l) => l.length > 0);
}
