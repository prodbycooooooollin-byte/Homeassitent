const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json',
};
const MAX_DOWNLOAD = 64 * 1024 * 1024;

// Die App wird über http://127.0.0.1 ausgeliefert statt file://, weil YouTube-Einbettungen
// einen http(s)-Ursprung verlangen (sonst "Fehler 153").
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.normalize(path.join(DIST, urlPath === '/' ? 'index.html' : urlPath));
      if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// Datei-Download ohne CORS-Einschränkung (für .litematic-Links aus Videobeschreibungen).
ipcMain.handle('download', async (_e, url) => {
  const u = new URL(String(url));
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http(s)-Links erlaubt.');
  const res = await net.fetch(u.toString(), { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_DOWNLOAD) throw new Error('Datei ist zu groß (max. 64 MB).');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD) throw new Error('Datei ist zu groß (max. 64 MB).');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

async function createWindow() {
  const port = await serve();
  const win = new BrowserWindow({
    width: 1280, height: 860, backgroundColor: '#1b1d1a', title: 'FarmFinder',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Externe Links im Standardbrowser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
