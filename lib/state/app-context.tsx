"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AppSnapshot } from "../ha/types";
import { createHaClient } from "../ha";
import type { HaClient } from "../ha/types";
import type { AlarmMode, Automation, AppSettings, ClimateMode, ConnectionStatus, EnergyByCategory, EnergyPoint, TimeRange } from "../types";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";
import { useToast } from "./toast-context";

interface AppContextValue {
  snapshot: AppSnapshot | null;
  loading: boolean;
  connectionStatus: ConnectionStatus;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  toggleDevice: (deviceId: string) => Promise<void>;
  setDeviceTimer: (deviceId: string, minutes: number | null) => Promise<void>;
  setDeviceRoom: (deviceId: string, roomId: string) => Promise<void>;
  setRoomTarget: (roomId: string, target: number) => Promise<void>;
  setRoomMode: (roomId: string, mode: ClimateMode) => Promise<void>;
  setWaterHeaterPower: (on: boolean) => Promise<void>;
  setWaterHeaterTimer: (minutes: number | null) => Promise<void>;
  setWaterHeaterTarget: (target: number) => Promise<void>;
  runQuickAction: (actionId: string) => Promise<void>;
  setAutomationEnabled: (automationId: string, enabled: boolean) => Promise<void>;
  createAutomation: (automation: Automation) => Promise<void>;
  setAlarmMode: (mode: AlarmMode) => Promise<void>;

  fetchEnergyHistory: (range: TimeRange) => Promise<EnergyPoint[]>;
  fetchEnergyBreakdown: () => Promise<{ byDevice: EnergyByCategory[]; byRoom: EnergyByCategory[] }>;
}

const AppContext = createContext<AppContextValue | null>(null);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  const clientRef = useRef<HaClient | null>(null);
  const snapshotRef = useRef<AppSnapshot | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Client (neu) verbinden, wenn sich der Demo/Live-Modus ändert.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    const client = createHaClient(settings.demoMode);
    clientRef.current = client;

    const unsubscribeStatus = client.onStatusChange((status) => {
      if (!cancelled) setConnectionStatus(status);
    });
    const unsubscribeSnapshot = client.subscribe((next) => {
      if (!cancelled) {
        setSnapshot(next);
        snapshotRef.current = next;
      }
    });

    client
      .connect()
      .then(() => client.getSnapshot())
      .then((initial) => {
        if (cancelled) return;
        setSnapshot(initial);
        snapshotRef.current = initial;
      })
      .catch(() => {
        if (!cancelled) showToast("Verbindung zu Home Assistant fehlgeschlagen.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribeStatus();
      unsubscribeSnapshot();
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.demoMode]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const performAction = useCallback(
    async (
      optimistic: (draft: AppSnapshot) => void,
      apply: () => Promise<void>,
      opts?: { success?: string; error?: string },
    ) => {
      const previous = snapshotRef.current;
      if (!previous) {
        try {
          await apply();
        } catch (err) {
          showToast(opts?.error ?? messageOf(err), "error");
        }
        return;
      }
      const next = clone(previous);
      optimistic(next);
      setSnapshot(next);
      snapshotRef.current = next;

      try {
        await apply();
        if (opts?.success) showToast(opts.success, "success");
      } catch (err) {
        setSnapshot(previous);
        snapshotRef.current = previous;
        showToast(opts?.error ?? messageOf(err), "error");
      }
    },
    [showToast],
  );

  const toggleDevice = useCallback(
    async (deviceId: string) => {
      const client = clientRef.current;
      if (!client) return;
      const current = snapshotRef.current?.devices.find((d) => d.id === deviceId);
      const nextOn = !(current?.isOn ?? false);
      await performAction(
        (draft) => {
          const device = draft.devices.find((d) => d.id === deviceId);
          if (device) {
            device.isOn = nextOn;
            device.status = nextOn ? "active" : "standby";
            if (!nextOn) device.currentPowerW = 0;
          }
        },
        () => client.setDevicePower(deviceId, nextOn),
        { error: "Gerät konnte nicht geschaltet werden." },
      );
    },
    [performAction],
  );

  const setDeviceTimer = useCallback(
    async (deviceId: string, minutes: number | null) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          const device = draft.devices.find((d) => d.id === deviceId);
          if (device) device.timerMinutesLeft = minutes ?? undefined;
        },
        () => client.setDeviceTimer(deviceId, minutes),
        { success: minutes ? `Timer auf ${minutes} Min. gesetzt.` : "Timer gestoppt." },
      );
    },
    [performAction],
  );

  const setDeviceRoom = useCallback(
    async (deviceId: string, roomId: string) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          const device = draft.devices.find((d) => d.id === deviceId);
          if (device) device.roomId = roomId;
        },
        () => client.setDeviceRoom(deviceId, roomId),
        { success: "Raum aktualisiert.", error: "Raum konnte nicht geändert werden." },
      );
    },
    [performAction],
  );

  const setRoomTarget = useCallback(
    async (roomId: string, target: number) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          const room = draft.rooms.find((r) => r.id === roomId);
          if (room) room.targetTemperature = target;
        },
        () => client.setRoomTargetTemperature(roomId, target),
        { error: "Zieltemperatur konnte nicht gesetzt werden." },
      );
    },
    [performAction],
  );

  const setRoomMode = useCallback(
    async (roomId: string, mode: ClimateMode) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          const room = draft.rooms.find((r) => r.id === roomId);
          if (room) room.mode = mode;
        },
        () => client.setRoomMode(roomId, mode),
        { error: "Modus konnte nicht geändert werden." },
      );
    },
    [performAction],
  );

  const setWaterHeaterPower = useCallback(
    async (on: boolean) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          draft.waterHeater.isOn = on;
          if (!on) draft.waterHeater.currentPowerW = 0;
        },
        () => client.setWaterHeaterPower(on),
        { success: on ? "Heizstab eingeschaltet." : "Heizstab ausgeschaltet.", error: "Heizstab konnte nicht geschaltet werden." },
      );
    },
    [performAction],
  );

  const setWaterHeaterTimer = useCallback(
    async (minutes: number | null) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          draft.waterHeater.timerMinutesLeft = minutes;
        },
        () => client.setWaterHeaterTimer(minutes),
        { success: minutes ? `Heizstab-Timer: ${minutes} Min.` : "Dauerbetrieb aktiviert." },
      );
    },
    [performAction],
  );

  const setWaterHeaterTarget = useCallback(
    async (target: number) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          draft.waterHeater.targetTemperature = target;
        },
        () => client.setWaterHeaterTarget(target),
        { error: "Zieltemperatur konnte nicht gesetzt werden." },
      );
    },
    [performAction],
  );

  const runQuickAction = useCallback(
    async (actionId: string) => {
      const client = clientRef.current;
      if (!client) return;
      const action = snapshotRef.current?.quickActions.find((a) => a.id === actionId);
      const nextActive = !(action?.active ?? false);
      await performAction(
        (draft) => {
          const a = draft.quickActions.find((qa) => qa.id === actionId);
          if (!a) return;
          a.active = nextActive;
          if (a.type === "lights") {
            draft.devices
              .filter((d) => d.type === "light")
              .forEach((d) => {
                d.isOn = nextActive;
                d.status = nextActive ? "active" : "standby";
              });
          }
          if (a.type === "outlets") {
            draft.devices
              .filter((d) => d.type === "outlet")
              .forEach((d) => {
                d.isOn = nextActive;
                d.status = nextActive ? "active" : "standby";
              });
          }
          if (a.type === "waterheater") {
            draft.waterHeater.isOn = nextActive;
            if (!nextActive) draft.waterHeater.currentPowerW = 0;
          }
          if (a.type === "all-off") {
            draft.devices.forEach((d) => {
              if (d.controllable) {
                d.isOn = false;
                d.status = "standby";
                d.currentPowerW = 0;
              }
            });
            draft.waterHeater.isOn = false;
            draft.waterHeater.currentPowerW = 0;
          }
        },
        () => client.runQuickAction(actionId),
        { success: `${action?.label ?? "Aktion"} ${nextActive ? "aktiviert" : "deaktiviert"}.` },
      );
    },
    [performAction],
  );

  const setAutomationEnabled = useCallback(
    async (automationId: string, enabled: boolean) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          const automation = draft.automations.find((a) => a.id === automationId);
          if (automation) automation.enabled = enabled;
        },
        () => client.setAutomationEnabled(automationId, enabled),
        { success: enabled ? "Automation aktiviert." : "Automation deaktiviert." },
      );
    },
    [performAction],
  );

  const createAutomation = useCallback(
    async (automation: Automation) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          draft.automations = [automation, ...draft.automations];
        },
        () => client.createAutomation(automation),
        { success: "Automation erstellt.", error: "Automation konnte nicht erstellt werden." },
      );
    },
    [performAction],
  );

  const setAlarmMode = useCallback(
    async (mode: AlarmMode) => {
      const client = clientRef.current;
      if (!client) return;
      await performAction(
        (draft) => {
          draft.alarmMode = mode;
        },
        () => client.setAlarmMode(mode),
        { success: `Alarmmodus: ${mode}`, error: "Alarmmodus konnte nicht geändert werden." },
      );
    },
    [performAction],
  );

  const fetchEnergyHistory = useCallback(async (range: TimeRange) => {
    const client = clientRef.current;
    if (!client) return [];
    return client.getEnergyHistory(range);
  }, []);

  const fetchEnergyBreakdown = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return { byDevice: [], byRoom: [] };
    return client.getEnergyBreakdown();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      snapshot,
      loading,
      connectionStatus,
      settings,
      updateSettings,
      toggleDevice,
      setDeviceTimer,
      setDeviceRoom,
      setRoomTarget,
      setRoomMode,
      setWaterHeaterPower,
      setWaterHeaterTimer,
      setWaterHeaterTarget,
      runQuickAction,
      setAutomationEnabled,
      createAutomation,
      setAlarmMode,
      fetchEnergyHistory,
      fetchEnergyBreakdown,
    }),
    [
      snapshot,
      loading,
      connectionStatus,
      settings,
      updateSettings,
      toggleDevice,
      setDeviceTimer,
      setDeviceRoom,
      setRoomTarget,
      setRoomMode,
      setWaterHeaterPower,
      setWaterHeaterTimer,
      setWaterHeaterTarget,
      runQuickAction,
      setAutomationEnabled,
      createAutomation,
      setAlarmMode,
      fetchEnergyHistory,
      fetchEnergyBreakdown,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Aktion fehlgeschlagen.";
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp muss innerhalb von AppProvider verwendet werden");
  return ctx;
}
