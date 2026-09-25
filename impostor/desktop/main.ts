import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';

declare const __DEFAULT_SERVER__: string;

/**
 * Desktop-Hülle für den Web-Client. Enthält KEINEN Spielserver – die App
 * verbindet sich mit einem erreichbaren Impostor-Server (siehe README).
 * Serveradresse: Umgebungsvariable IMPOSTOR_SERVER_URL, sonst Build-Standard,
 * sonst in der App unter „Einstellungen → Spielserver" eintragen.
 */
const defaultServer = process.env.IMPOSTOR_SERVER_URL || __DEFAULT_SERVER__ || '';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#090d19',
    title: 'Impostor',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win?.show());
  void win.loadFile(join(__dirname, '..', 'client', 'index.html'));

  // Keine Navigation weg von der App; externe Links im Browser öffnen.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      e.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) {
      win?.webContents.toggleDevTools();
    }
  });
}

ipcMain.on('impostor:config', (e) => {
  e.returnValue = { defaultServer };
});
ipcMain.handle('impostor:toggle-fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('impostor:is-fullscreen', () => win?.isFullScreen() ?? false);

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
