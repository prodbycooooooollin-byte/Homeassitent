import * as fs from 'node:fs';
import * as https from 'node:https';

// OPTIONAL und bewusst gekapselt: Die League Client API (LCU) ist für
// Drittanbieter NICHT offiziell unterstützt. Sie wird hier ausschließlich
// lesend genutzt, um die Spielversion zu ermitteln, die die Live Client
// Data API nicht liefert. Standardmäßig deaktiviert; Fallback: manuelle Angabe.

export interface LcuOptions {
  lockfilePath: string;
}

export const DEFAULT_LOCKFILE = 'C:\\Riot Games\\League of Legends\\lockfile';

export async function readGameVersionFromLcu(opts: LcuOptions): Promise<string | null> {
  if (!fs.existsSync(opts.lockfilePath)) return null;
  const parts = fs.readFileSync(opts.lockfilePath, 'utf8').trim().split(':');
  if (parts.length < 5) return null;
  const [, , port, password, protocol] = parts;
  if (protocol !== 'https') return null;
  const auth = Buffer.from(`riot:${password}`).toString('base64');
  return new Promise((resolve) => {
    const req = https.get({
      host: '127.0.0.1', port: Number(port), path: '/lol-patch/v1/game-version',
      headers: { Authorization: `Basic ${auth}` }, rejectUnauthorized: false, timeout: 1500,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { const v = JSON.parse(body); resolve(typeof v === 'string' ? v : null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
