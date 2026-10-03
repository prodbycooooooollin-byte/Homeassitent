/**
 * Lastmessung (kein Unit-Test): N Räume × 4 Bots spielen gleichzeitig über echte
 * WebSocket-Verbindungen. Aufruf: npx tsx apps/server/test/load.bench.ts 50
 */
import { performance } from 'node:perf_hooks';
import { Bot, startServer, until } from './helpers.js';

const rooms = Number(process.argv[2] ?? 25);
const { server, url } = await startServer({ maxRooms: 1000, trustProxy: true });
const t0 = performance.now();
const cpu0 = process.cpuUsage();
const all: Bot[] = [];
await Promise.all(
  Array.from({ length: rooms }, async (_, r) => {
    const bots = Array.from({ length: 4 }, (_, i) => new Bot(url, `R${r}Spieler${i}`, { 'x-forwarded-for': `10.0.${r}.${i + 1}` }));
    all.push(...bots);
    await bots[0]!.create('demo');
    for (const b of bots.slice(1)) await b.join(bots[0]!.code);
    const code = bots[0]!.code;
    for (const b of bots) b.choose = (v) => v.round!.answerOptions[Math.floor(Math.random() * v.round!.answerOptions.length)]!;
    for (const b of bots) await b.prepareLobby(20);
    await bots[0]!.emit('start');
    await until(() => bots[0]!.view?.phase === 'RESULTS', 120000, `Raum ${code}`);
  })
);
const ms = performance.now() - t0;
const cpu = process.cpuUsage(cpu0);
const mem = process.memoryUsage();
console.log(JSON.stringify({ rooms, players: rooms * 4, roundsTotal: rooms * 20, wallSec: +(ms / 1000).toFixed(1), cpuSec: +((cpu.user + cpu.system) / 1e6).toFixed(1), rssMB: Math.round(mem.rss / 1e6), heapMB: Math.round(mem.heapUsed / 1e6) }));
all.forEach((b) => b.close());
await server.close();
process.exit(0);
