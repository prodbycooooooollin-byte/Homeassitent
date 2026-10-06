'use strict';
const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 650,
    backgroundColor: '#07060a', title: 'Aethermoor – Die Schattenkrone', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.on('page-title-updated', e => e.preventDefault());
  const smoke = process.argv.find(a => a.startsWith('--smoke='));
  if (smoke) { // Selbsttest: Spiel starten, Screenshot speichern, beenden
    win.webContents.on('did-finish-load', () => setTimeout(async () => {
      await win.webContents.executeJavaScript("document.getElementById('startBtn').click()");
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(smoke.slice(8), img.toPNG());
        app.quit();
      }, 7000);
    }, 3000));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
