# Grafik-, Sound- und Schrift-Assets

| Asset | Herkunft | Lizenz |
|---|---|---|
| App-Icon (`apps/desktop/build/icon.*`, `public/icon.png`) | selbst erzeugt per Skript `apps/desktop/scripts/make-icon.mjs` | Projekt |
| UI-Icons (`components/ui.tsx`) | selbst gezeichnete SVG-Pfade | Projekt |
| Avatare | Unicode-Emoji, dargestellt mit der Systemschrift (Segoe UI Emoji), eigene Farbverläufe | Emoji-Zeichen sind Unicode-Codepunkte; die Glyphen liefert Windows |
| Hintergrund, Partikel, Podest, Konfetti | CSS/Canvas, selbst erstellt | Projekt |
| **Alle Sounds und die Menümusik** | zur Laufzeit per Web Audio API synthetisiert (`src/lib/sound.ts`) – keine Audiodateien | Projekt |
| Demo-Testclips | zur Laufzeit per Canvas + Web Audio erzeugt (`src/player/DemoClip.tsx`) | Projekt |
| Schrift „Unbounded“ | `@fontsource-variable/unbounded` | SIL Open Font License 1.1 |
| Schrift „Inter“ | `@fontsource-variable/inter` | SIL Open Font License 1.1 |

Es werden keine Markenassets oder Screens von WhoLiked oder TikTok verwendet. TikTok-Inhalte erscheinen nur
im offiziellen Embed Player, samt dessen Quellenkennzeichnung und Wasserzeichen.

Laufzeit-Abhängigkeiten (Auszug, Versionen im `package-lock.json`): Electron (MIT), React (MIT), motion (MIT),
zustand (MIT), socket.io / socket.io-client (MIT), zod (MIT), electron-updater (MIT), stream-json (BSD-3),
yauzl (MIT).
