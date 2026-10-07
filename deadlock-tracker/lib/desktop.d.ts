export interface UpdaterState {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "uptodate" | "error" | "unsupported";
  version: string; // Zielversion (bei ready/available) bzw. aktuelle
  current: string;
  percent: number;
  message: string;
  releasesUrl: string;
  lastCheck?: number;
}
export interface DesktopBridge {
  isDesktop: true;
  getInfo(): Promise<UpdaterState>;
  checkForUpdates(): Promise<UpdaterState>;
  installUpdate(): Promise<void>;
  onUpdateState(cb: (s: UpdaterState) => void): () => void;
}
declare global {
  interface Window { desktop?: DesktopBridge }
}
