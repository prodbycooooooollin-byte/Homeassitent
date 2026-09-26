import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TokenSet } from '@liked/tiktok-connectors/node';

/**
 * Datensatz des getrennten Authentifizierungsdienstes. Liegt verschlüsselt
 * (AES-256-GCM) auf der Platte und ist vollständig vom Raumzustand getrennt.
 */
export interface AuthRecord {
  /** SHA-256 des Geräte-Geheimnisses (nie das Geheimnis selbst). */
  id: string;
  createdAt: number;
  lastSeenAt: number;
  tokens: TokenSet | null;
  displayName: string | null;
  state:
    | 'authorizing'
    | 'connected'
    | 'syncing'
    | 'ready'
    | 'expired'
    | 'error'
    | 'unsupported';
  error: string | null;
  sync: {
    requestId: string | null;
    stage: 'requesting' | 'preparing' | 'downloading' | 'extracting' | null;
    startedAt: number | null;
    nextCheckAt: number | null;
    attempt: number;
    completedAt: number | null;
  };
  /** Nur Like-IDs + Datum, bis der Client sie abgeholt hat (kurzlebig). */
  likes: { id: string; t?: number }[] | null;
  likesExpireAt: number | null;
}

export class TokenStore {
  private records = new Map<string, AuthRecord>();
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly key: Buffer
  ) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = join(dataDir, 'auth-store.bin');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const buf = readFileSync(this.file);
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const d = createDecipheriv('aes-256-gcm', this.key, iv);
      d.setAuthTag(tag);
      const json = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
      const arr = JSON.parse(json) as AuthRecord[];
      this.records = new Map(arr.map((r) => [r.id, r]));
    } catch {
      // Falscher Schlüssel oder beschädigt: nicht raten, sauber neu beginnen.
      this.records = new Map();
    }
  }

  private persist(): void {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([c.update(JSON.stringify([...this.records.values()]), 'utf8'), c.final()]);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  get(id: string): AuthRecord | undefined {
    return this.records.get(id);
  }

  upsert(rec: AuthRecord): void {
    this.records.set(rec.id, rec);
    this.persist();
  }

  delete(id: string): void {
    if (this.records.delete(id)) this.persist();
  }

  all(): AuthRecord[] {
    return [...this.records.values()];
  }

  /** Aufräumen, auch direkt nach einem Neustart. */
  purge(now: number, maxIdleMs: number): number {
    let removed = 0;
    for (const r of [...this.records.values()]) {
      if (r.likesExpireAt && r.likesExpireAt < now) {
        r.likes = null;
        r.likesExpireAt = null;
      }
      const refreshDead = r.tokens && r.tokens.refreshExpiresAt > 0 && r.tokens.refreshExpiresAt < now;
      if (now - r.lastSeenAt > maxIdleMs || (refreshDead && r.state !== 'syncing') || (!r.tokens && now - r.createdAt > 3_600_000)) {
        this.records.delete(r.id);
        removed++;
      }
    }
    this.persist();
    return removed;
  }

  wipeFile(): void {
    if (existsSync(this.file)) rmSync(this.file);
  }
}
