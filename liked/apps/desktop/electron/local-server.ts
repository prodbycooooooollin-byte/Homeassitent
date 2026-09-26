import { networkInterfaces } from 'node:os';
import { createLikedServer, type LikedServer } from '@liked/server';
import { loadConfig } from '@liked/server/config';
import type { LocalServerState } from '../src/shared/ipc-types.js';

/**
 * Optionaler lokaler Hostbetrieb: startet den Spielserver im App-Prozess.
 * Ohne Portweiterleitung/VPN ist er nur im eigenen Netz erreichbar. Der
 * offizielle TikTok-Adapter ist hier bewusst deaktiviert (keine Secrets im Build).
 */
export class LocalServer {
  private server: LikedServer | null = null;
  private port: number | null = null;

  status(error?: string): LocalServerState {
    const addresses: string[] = [];
    if (this.server && this.port) {
      for (const list of Object.values(networkInterfaces())) {
        for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) addresses.push(`http://${a.address}:${this.port}`);
      }
      addresses.unshift(`http://localhost:${this.port}`);
    }
    return { running: !!this.server, port: this.port, addresses, error };
  }

  async start(port: number): Promise<LocalServerState> {
    if (this.server) return this.status();
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return this.status('Ungültiger Port');
    try {
      const cfg = loadConfig({ PORT: String(port), HOST: '0.0.0.0', LOG_LEVEL: 'warn' } as NodeJS.ProcessEnv);
      this.server = createLikedServer({ ...cfg, tiktok: null, tokenEncryptionKey: null });
      this.port = await this.server.listen();
      return this.status();
    } catch (e) {
      this.server = null;
      this.port = null;
      return this.status(e instanceof Error ? e.message : 'Start fehlgeschlagen');
    }
  }

  async stop(): Promise<LocalServerState> {
    await this.server?.close();
    this.server = null;
    this.port = null;
    return this.status();
  }
}
