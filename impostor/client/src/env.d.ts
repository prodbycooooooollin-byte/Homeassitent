declare const __DEFAULT_SERVER__: string;
declare const __APP_VERSION__: string;

interface ImpostorDesktopBridge {
  isDesktop: true;
  defaultServer: string;
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
}

interface Window {
  impostorDesktop?: ImpostorDesktopBridge;
}

declare module '*.css';
