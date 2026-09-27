import { EventEmitter } from 'node:events';
import type { ProviderSnapshot, SourceId } from '../shared/types';

// Gemeinsamer Vertrag aller Datenprovider: Sie liefern ausschließlich
// normalisierte ProviderSnapshots. Keine Gameplay-Logik hier.

export type ProviderState = 'idle' | 'connecting' | 'waiting' | 'live' | 'error' | 'ended';

export interface ProviderDiagnostics {
  id: SourceId;
  label: string;
  state: ProviderState;
  detail: string;
  startedAt: number | null;
  lastDataAt: number | null;
  rawEvents: number;
  snapshots: number;
  /** gemessene Abstände zwischen Snapshots (ms) */
  intervalMsAvg: number | null;
  /** IDs aus der Quelle, die keinem Item zugeordnet werden konnten */
  unknownItemIds: number[];
  /** Beobachtungen zur Datenverfügbarkeit (für den Daten-Prototyp) */
  notes: string[];
  errors: string[];
}

export abstract class Provider extends EventEmitter {
  abstract readonly id: SourceId;
  abstract readonly label: string;
  protected diag: Omit<ProviderDiagnostics, 'id' | 'label'> = {
    state: 'idle', detail: '', startedAt: null, lastDataAt: null, rawEvents: 0, snapshots: 0, intervalMsAvg: null, unknownItemIds: [], notes: [], errors: [],
  };

  abstract start(): void;
  abstract stop(): void;

  diagnostics(): ProviderDiagnostics { return { id: this.id, label: this.label, ...this.diag }; }

  protected setState(state: ProviderState, detail = '') {
    this.diag.state = state;
    this.diag.detail = detail;
    this.emit('status', this.diagnostics());
  }

  protected emitSnapshot(s: ProviderSnapshot) {
    const prev = this.diag.lastDataAt;
    if (prev !== null) {
      const d = s.receivedAt - prev;
      this.diag.intervalMsAvg = this.diag.intervalMsAvg === null ? d : this.diag.intervalMsAvg * 0.8 + d * 0.2;
    }
    this.diag.lastDataAt = s.receivedAt;
    this.diag.snapshots++;
    this.emit('snapshot', s);
  }

  protected error(msg: string) {
    this.diag.errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    if (this.diag.errors.length > 20) this.diag.errors.shift();
  }
}
