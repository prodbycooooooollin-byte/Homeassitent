// Verknüpft Planobjekte mit Gerätezuordnungen und aktuellen Zuständen.
import type { BindingTarget, DeviceBinding, Project } from "@/model/types";
import type { HaState } from "./ha-types";
import { capabilityOf, friendlyName, type Capability } from "./capabilities";
import { freshness, type Freshness } from "./state";

export interface BoundDevice {
  binding: DeviceBinding;
  state: HaState | undefined;
  capability: Capability;
  name: string;
  freshness: Freshness;
}

export function bindingsFor(project: Project, target: BindingTarget): DeviceBinding[] {
  return project.bindings.filter((b) => b.target.kind === target.kind && b.target.id === target.id);
}

export function boundDevices(project: Project, target: BindingTarget, states: Record<string, HaState>, connected: boolean): BoundDevice[] {
  return bindingsFor(project, target).map((b) => describeBinding(b, states, connected));
}

export function describeBinding(b: DeviceBinding, states: Record<string, HaState>, connected: boolean): BoundDevice {
  const state = states[b.entityId];
  const capability: Capability = state ? capabilityOf(state) : fallbackCapability(b.role);
  return { binding: b, state, capability, name: friendlyName(state, b.entityId), freshness: freshness(state, connected) };
}

function fallbackCapability(role: DeviceBinding["role"]): Capability {
  switch (role) {
    case "light":
      return { kind: "light", brightness: false, colorTemp: null, color: false };
    case "switch":
      return { kind: "switch", isOutlet: false };
    case "cover":
      return { kind: "cover", open: false, close: false, stop: false, position: false };
    case "contact":
      return { kind: "contact", canTilt: false, deviceClass: "window" };
    case "climate":
      return { kind: "climate", hvacModes: [], target: null, canTurnOff: false };
    default:
      return { kind: "sensor", quantity: "other", unit: null };
  }
}

export function targetKey(t: BindingTarget) {
  return `${t.kind}:${t.id}`;
}
