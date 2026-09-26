# Build & Release

## Lokal

```bash
cd liked
npm ci
npm run typecheck && npm test
npm run build                      # Server-Bundle + Desktop (Renderer + Main)
npm run dist:win                   # auf Windows: apps/desktop/release/LIKED-Setup-<version>.exe
# Standard-Serveradresse im Build festlegen (kein Secret):
LIKED_SERVER_URL=https://liked.example.org npm run dist:win
```

Icon neu erzeugen: `npm run icon -w @liked/desktop`.

## CI (GitHub Actions: `.github/workflows/release-liked.yml`)

1. **test** (Ubuntu): `npm ci`, Typprüfung, alle Tests, Server-Bundle.
2. **build-windows**: Tests unter Windows, NSIS-Installer, stille Installation → Startmenü-Prüfung →
   `LIKED.exe --smoke-test` → stille Deinstallation.
3. Release `liked-v<version>` (Vorabversion) sowie der Update-Kanal `liked-latest` mit `latest.yml`, Installer und Blockmap.

Eine neue Version erhält man, indem `version` in `apps/desktop/package.json` erhöht wird (optional auch im
Root-`package.json`) und die Änderung gepusht wird.

## Updates

`electron-updater` mit generischer Quelle
`https://github.com/prodbycooooooollin-byte/Homeassitent/releases/download/liked-latest`.
Die App sucht beim Start im Hintergrund nach Updates. Herunterladen und „Beim nächsten Beenden installieren“ löst
der Nutzer selbst aus. Updates werden nie während einer Partie installiert. Einstellungen und Likes liegen in
`%APPDATA%/LIKED` und bleiben bei Updates erhalten.

**Grenzen:**
- `latest.yml` enthält SHA-512-Prüfsummen. Das sichert die **Integrität**, nicht die **Echtheit**. Echtheit setzt
  eine Code-Signatur voraus (Zertifikat oder Signierdienst, z. B. Azure Trusted Signing) und in electron-builder
  `win.signtoolOptions`/`azureSignOptions`. **Derzeit ist nicht signiert** (SmartScreen-Warnung).
- Ist das Repository privat, können Clients die Release-Dateien ohne Anmeldung nicht laden. Dann das Repository
  öffentlich machen oder die Releases auf einem eigenen Webserver/Bucket hosten und `publish.url` anpassen.
