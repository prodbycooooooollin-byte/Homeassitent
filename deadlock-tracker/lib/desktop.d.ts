export interface UpdaterState {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "uptodate" | "error" | "unsupported";
  version: string; // Zielversion (bei ready/available) bzw. aktuelle
  current: string;
  percent: number;
  message: string;
  releasesUrl: string;
  lastCheck?: number;
}
export interface DesktopSettings { closeToTray: boolean; autoStart: boolean; startMinimized: boolean; desktopNotifications: boolean; ingest: boolean }
export interface IngestState { state: "off" | "downloading" | "running" | "external" | "error" | "unsupported"; message: string; pid: number | null; since: number | null; restarts: number; lines: string[] }
export interface DesktopBridge {
  isDesktop: true;
  getInfo(): Promise<UpdaterState>;
  checkForUpdates(): Promise<UpdaterState>;
  installUpdate(): Promise<void>;
  onUpdateState(cb: (s: UpdaterState) => void): () => void;
  platform: string;
  getDesktopSettings(): Promise<DesktopSettings>;
  setDesktopSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  getIngest(): Promise<IngestState>;
  onIngestState(cb: (s: IngestState) => void): () => void;
  notify(n: { title: string; body: string; path?: string }): Promise<boolean>;
  onNavigate(cb: (path: string) => void): () => void;
}
declare global {
  interface Window { desktop?: DesktopBridge }
}
