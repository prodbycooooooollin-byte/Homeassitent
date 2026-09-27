export interface Bridge {
  onVM(cb: (m: unknown) => void): void;
  onControl(cb: (m: unknown) => void): void;
  onSelectTab(cb: (t: string) => void): void;
  send(action: unknown): void;
}
export const bridge = (window as unknown as { dia: Bridge }).dia;
