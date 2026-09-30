// Einstiegspunkt des Recherche-Backends.
//   tsx server/main.ts api        – nur HTTP-API
//   tsx server/main.ts worker     – nur Hintergrundjobs (Scheduler + Queue)
//   tsx server/main.ts all        – beides in einem Prozess (kleine Installationen)
//   tsx server/main.ts run-once <sourceId>  – eine Quelle sofort ausführen und Ergebnis ausgeben
//   tsx server/main.ts status     – Abdeckung/Quellenstatus ausgeben

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { Fetcher } from './net/fetcher.ts';
import { createApi, searchActive } from './api.ts';
import { claimNext, enqueue, loadSeedFile, runJob, seedSources, startWorker } from './jobs.ts';
import { AiExtractor, AnthropicClient } from './extract/ai.ts';
import { coverage } from './pipeline/store.ts';
import { seedDemo } from './demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
seedSources(db, cfg, loadSeedFile(process.env.CITADEL_SOURCES || join(here, 'sources.json')));
if (cfg.demo) seedDemo(db);
const fetcher = new Fetcher({ db, userAgent: cfg.userAgent, allowPrivate: cfg.allowPrivateNetworkForTests, defaultMaxBytes: cfg.maxFetchBytes });
const ai = cfg.anthropicKey ? new AiExtractor(db, new AnthropicClient(), cfg.aiModel, cfg.aiDailyBudgetUsd) : null;
const deps = { db, cfg, fetcher, ai };

const mode = process.argv[2] || 'all';
if (mode === 'api' || mode === 'all') {
  createApi(db, cfg).listen(cfg.port, cfg.host, () => console.log(`[api] CITADEL API v1 auf http://${cfg.host}:${cfg.port}`));
}
if (mode === 'worker' || mode === 'all') {
  console.log(`[worker] gestartet – AI-Extraktion ${ai ? `aktiv (${cfg.aiModel}, Budget ${cfg.aiDailyBudgetUsd} USD/Tag)` : 'inaktiv (ANTHROPIC_API_KEY fehlt)'}`);
  startWorker(deps);
}
if (mode === 'run-once') {
  const id = process.argv[3];
  if (!id) throw new Error('Quelle angeben: run-once <sourceId>');
  enqueue(db, id, 'source', {}, `source:${id}`);
  // Nur diese Quelle und ihre Folgejobs (z. B. Seitenabrufe) abarbeiten – keine anderen Quellen einplanen.
  for (let i = 0, job = claimNext(db); job && i < 500; i++, job = claimNext(db)) console.log(await runJob(deps, job));
  console.log(JSON.stringify(coverage(db, { searchActive: searchActive(db, cfg), aiActive: Boolean(ai) }, false), null, 2));
}
if (mode === 'status') {
  console.log(JSON.stringify(coverage(db, { searchActive: searchActive(db, cfg), aiActive: Boolean(ai) }, cfg.demo), null, 2));
}
