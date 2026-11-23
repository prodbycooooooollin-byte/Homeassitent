import type { ControlSnapshot } from '../main/controller';
import type { OverlayVM } from '../present/viewModel';

export interface LolbaBridge {
  onVM(cb: (vm: OverlayVM) => void): void;
  onControl(cb: (c: ControlSnapshot) => void): void;
  onLayout(cb: (l: { scale: number; expanded: boolean; interactive: boolean }) => void): void;
  send(a: unknown): void;
}

export const bridge = (window as unknown as { lolba: LolbaBridge }).lolba;
