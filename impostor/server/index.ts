import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from './app.ts';

/**
 * Startpunkt des Echtzeitservers.
 *   PORT        (Standard 8787)
 *   HOST        (Standard 0.0.0.0)
 *   STATIC_DIR  Verzeichnis des gebauten Web-Clients (Standard: ../client neben dieser Datei bzw. dist/client)
 *   TRUST_PROXY=1            X-Forwarded-For auswerten (nur hinter eigenem Reverse Proxy)
 *   MAX_CONNECTIONS_PER_IP   (Standard 40)
 *   MAX_LOBBIES              (Standard 2000)
 */
const here = dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR ?? join(here, '..', 'client');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const server = new GameServer({
  staticDir,
  trustProxy: process.env.TRUST_PROXY === '1',
  maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP ?? 40),
  maxLobbies: Number(process.env.MAX_LOBBIES ?? 2000),
});
const actual = await server.listen(port, host);
console.log(`[impostor] Server läuft auf http://${host}:${actual} (WebSocket: /ws)`);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    console.log('[impostor] Fahre herunter …');
    await server.shutdown();
    process.exit(0);
  });
}
