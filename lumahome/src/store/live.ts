// Live-Zustände der Geräte. Getrennt vom Projekt: Zustände werden nie
// gespeichert oder exportiert.
import { create } from "zustand";
import type { HaRegistry, HaState, HaStatisticMeta } from "@/devices/ha-types";
import type { ConnectionStatus, DeviceSource, ServiceCall } from "@/sources/types";

export interface PendingCommand {
  id: string;
  entityId: string;
  label: string;
  contextId: string | null;
  startedAt: number;
  phase: "sending" | "waiting" | "timeout" | "failed";
  error?: string;
}

/** Nach dieser Zeit ohne Bestätigung wird ein Befehl als „ohne Rückmeldung“ markiert. */
export const CONFIRM_TIMEOUT_MS = 10_000;

interface LiveStore {
  source: DeviceSource | null;
  status: ConnectionStatus;
  states: Record<string, HaState>;
  registry: HaRegistry | null;
  synced: boolean;
  lastEventAt: number | null;
  /** Ausstehende Befehle je Entität (höchstens einer) */
  pending: Record<string, PendingCommand>;
  statMeta: HaStatisticMeta[] | null;
  externalChanges: { entityId: string; at: number }[];
  setSource(source: DeviceSource | null): void;
  call(call: ServiceCall, label: string): Promise<boolean>;
  dismissPending(entityId: string): void;
}

const connectedKinds = new Set(["connected", "demo"]);
export const isConnected = (s: ConnectionStatus) => connectedKinds.has(s.kind);

export const useLive = create<LiveStore>((set, get) => ({
  source: null,
  status: { kind: "connecting" },
  states: {},
  registry: null,
  synced: false,
  lastEventAt: null,
  pending: {},
  statMeta: null,
  externalChanges: [],

  setSource(source) {
    const old = get().source;
    old?.stop();
    // Technische Trennung: beim Wechsel werden alle Zustände verworfen.
    set({ source, states: {}, registry: null, synced: false, pending: {}, statMeta: null, lastEventAt: null, externalChanges: [], status: { kind: "connecting" } });
    if (!source) return;
    source.start({
      onStatus: (status) => {
        if (get().source !== source) return;
        set({ status, ...(isConnected(status) ? {} : { synced: get().synced }) });
      },
      onSnapshot: (states, registry) => {
        if (get().source !== source) return;
        const map: Record<string, HaState> = {};
        for (const s of states) map[s.entity_id] = s;
        // Ausstehende Befehle bleiben bestehen, werden aber gegen den neuen Stand geprüft
        set({ states: map, registry, synced: true, lastEventAt: Date.now() });
        source.listStatisticIds().then((m) => get().source === source && set({ statMeta: m })).catch(() => set({ statMeta: [] }));
      },
      onState: (entityId, state) => {
        if (get().source !== source) return;
        const { states, pending, externalChanges } = get();
        const next = { ...states };
        if (state) next[entityId] = state;
        else delete next[entityId];
        const p = pending[entityId];
        const nextPending = { ...pending };
        let ext = externalChanges;
        const confirmed = p && ((p.contextId !== null && state?.context?.id === p.contextId) || (p.contextId === null && p.phase === "waiting"));
        if (confirmed) {
          delete nextPending[entityId];
        } else if (state && !entityId.startsWith("sensor.") && states[entityId]?.state !== state.state) {
          // Zustandsänderung, die nicht von LumaHome ausgelöst wurde
          ext = [...externalChanges.slice(-19), { entityId, at: Date.now() }];
        }
        set({ states: next, pending: nextPending, lastEventAt: Date.now(), externalChanges: ext });
      },
    });
  },

  async call(call, label) {
    const source = get().source;
    if (!source) return false;
    const id = `${call.entityId}:${Date.now()}`;
    set({ pending: { ...get().pending, [call.entityId]: { id, entityId: call.entityId, label, contextId: null, startedAt: Date.now(), phase: "sending" } } });
    try {
      const { contextId } = await source.callService(call);
      const p = get().pending[call.entityId];
      if (p?.id === id) {
        // Bestätigung kann bereits vor der Antwort eingetroffen sein
        const st = get().states[call.entityId];
        if (contextId && st?.context?.id === contextId) {
          const np = { ...get().pending };
          delete np[call.entityId];
          set({ pending: np });
        } else set({ pending: { ...get().pending, [call.entityId]: { ...p, contextId, phase: "waiting" } } });
      }
      setTimeout(() => {
        const cur = get().pending[call.entityId];
        if (cur?.id === id && cur.phase === "waiting") set({ pending: { ...get().pending, [call.entityId]: { ...cur, phase: "timeout" } } });
      }, CONFIRM_TIMEOUT_MS);
      return true;
    } catch (e) {
      const p = get().pending[call.entityId];
      if (p?.id === id) set({ pending: { ...get().pending, [call.entityId]: { ...p, phase: "failed", error: (e as Error).message } } });
      return false;
    }
  },

  dismissPending(entityId) {
    const np = { ...get().pending };
    delete np[entityId];
    set({ pending: np });
  },
}));
