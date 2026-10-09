// Broadcast-Worker: liest den Live-Strom (HTTP-Broadcast) eines laufenden Matches und meldet Spielerliste samt Werten an die App.
// Aufruf: node broadcast-worker.mjs '{"url":"http://dist1-…steamcontent.com/tv/<Match>_<Token>"}'
import { BroadcastAgent, BroadcastGateway, DemoSource, InterceptorStage, Parser, Protocol } from "deadem";

const job = JSON.parse(process.argv[2] || "{}");
const send = (m) => { try { process.send?.(m); } catch { /* Elternprozess weg */ } };
const num = (v) => (typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : v);
const toAccount = (v) => { try { const b = typeof v === "bigint" ? v : BigInt(v); return Number(b & 0xffffffffn); } catch { return 0; } };

async function main() {
  const m = /^(https?):\/\/(.+)\/([^/]+)\/?$/.exec(String(job.url || "").trim());
  if (!m) { send({ type: "error", message: "Ungültige Broadcast-Adresse" }); process.exit(1); }
  const [, scheme, base, match] = m;
  const gateway = new BroadcastGateway(base, scheme === "http" ? Protocol.HTTP : Protocol.HTTPS);
  const agent = new BroadcastAgent(gateway, match);
  const parser = new Parser();
  const demo = () => parser.getDemo();
  let last = 0, sentCount = 0;

  function snapshot() {
    const d = demo();
    if (!d) return;
    const players = [];
    for (const c of d.getEntitiesByClassName("CCitadelPlayerController")) {
      const names = [...c.fieldNames()];
      const team = num(c.getField("m_iTeamNum"));
      if (team !== 2 && team !== 3) continue;
      const sid = names.find((n) => /steam/i.test(n) && /id/i.test(n));
      const account = sid ? toAccount(c.getField(sid)) : 0;
      const hn = names.find((n) => /hero/i.test(n) && /id/i.test(n) && Number.isFinite(num(c.getField(n))));
      const name = c.getField("m_iszPlayerName");
      if (!account && !name) continue;
      const stats = {};
      for (const n of names) {
        if (!/kill|death|assist|level|networth|net_worth|souls|lasthit|last_hit|deny/i.test(n)) continue;
        const v = num(c.getField(n));
        if (Number.isFinite(v)) stats[n.replace(/^m_/, "")] = v;
      }
      players.push({ accountId: account, name: typeof name === "string" ? name : undefined, team: team - 2, heroId: hn ? num(c.getField(hn)) : undefined, stats });
    }
    if (players.length) { sentCount++; send({ type: "players", players, n: sentCount }); }
  }

  parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, () => {
    try { const now = Date.now(); if (now - last > 5000) { last = now; snapshot(); } } catch (e) { send({ type: "warn", message: String(e?.message ?? e).slice(0, 200) }); }
  });

  send({ type: "status", phase: "connect" });
  try { await parser.parse(agent.stream(), DemoSource.HTTP_BROADCAST); } catch (e) { send({ type: "error", message: `Broadcast nicht lesbar: ${e?.message ?? e}` }); process.exit(1); }
  send({ type: "done" });
  process.exit(0);
}
process.on("unhandledRejection", (e) => { send({ type: "error", message: `Broadcast: ${String(e?.message ?? e).slice(0, 200)}` }); process.exit(1); });
main().catch((e) => { send({ type: "error", message: String(e?.stack ?? e).slice(0, 300) }); process.exit(1); });
