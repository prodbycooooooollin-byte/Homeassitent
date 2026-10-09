export interface UpdaterState {
  portable?: boolean;
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "uptodate" | "error" | "unsupported";
  version: string; // Zielversion (bei ready/available) bzw. aktuelle
  current: string;
  percent: number;
  message: string;
  releasesUrl: string;
  lastCheck?: number;
}
export interface DesktopSettings { closeToTray: boolean; autoStart: boolean; startMinimized: boolean; desktopNotifications: boolean; ingest: boolean }
export interface IngestState { state: "off" | "downloading" | "running" | "external" | "error" | "unsupported"; message: string; pid: number | null; since: number | null; restarts: number; lines: IngestLine[]; matches: number; errors: number; dir: string }
export interface IngestLine { t: number; src: "app" | "stdout" | "stderr"; text: string }
export type IngestAction = "start" | "stop" | "restart" | "clear" | "openFolder";
export interface DesktopBridge {
  isDesktop: true;
  getInfo(): Promise<UpdaterState>;
  checkForUpdates(): Promise<UpdaterState>;
  installUpdate(): Promise<void>;
  runInstaller(): Promise<void>;
  onUpdateState(cb: (s: UpdaterState) => void): () => void;
  platform: string;
  getDesktopSettings(): Promise<DesktopSettings>;
  setDesktopSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  getIngest(): Promise<IngestState>;
  controlIngest(action: IngestAction): Promise<IngestState>;
  onIngestState(cb: (s: IngestState) => void): () => void;
  live(action: "status" | "login" | "logout" | "credentials" | "guard", payload?: { account?: string; password?: string; code?: string }): Promise<LiveInfo>;
  recorder(action: "start" | "stop" | "reset" | "status"): Promise<{ running: boolean; startedAt: number | null; count: number; text: string; file?: string | null }>;
  getMatchWatch(): Promise<{ dirs: string[]; last: { matchId: number; at: number } | null; error: string | null; watching: boolean }>;
  onMatchEnded(cb: (m: { matchId: number; at: number }) => void): () => void;
  wasUpdated(): Promise<boolean>;
  notify(n: { title: string; body: string; path?: string }): Promise<boolean>;
  onNavigate(cb: (path: string) => void): () => void;
}
declare global {
  interface Window { desktop?: DesktopBridge }
}

export interface LiveInfo {
  state: string; account: string | null; qr: string | null; guard?: string | null; error: string | null; matchId: number | null; lobbyId: string | null;
  url: string | null; result: string | null; players: { accountId: number; name?: string; team: number; heroId?: number; stats?: Record<string, number> }[]; playersAt: number | null; log: string[];
}
