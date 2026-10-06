# Aethermoor – Die Schattenkrone

3D-Fantasy-MMORPG als **Desktop-App** (Electron + Three.js). Mittelalter-/Fantasy-Welt mit Tag-und-Nacht-Wechsel,
Schatten, Wetter, vielen Bossen, Quests, Skillbäumen und einem kantigen "Obsidian & Gold"-Interface.

## Starten (PC)
Voraussetzung: [Node.js](https://nodejs.org) 18+.

```bash
cd mmorpg
npm install      # lädt Electron (einmalig)
npm start        # startet das Spiel als Desktop-Fenster
```

Installierbare Version bauen (Installer für das jeweilige Betriebssystem, auf diesem System ausführen):

```bash
npm run dist     # Windows: .exe-Installer · macOS: .dmg · Linux: AppImage  (Ergebnis in mmorpg/dist)
```

Vollbild: **F11**. Grafikqualität (Hoch/Mittel/Niedrig) im Menü (Esc).

## Hinweis zum "MMO"
Die Welt ist ein **Einzelspieler-Spiel mit simulierten Mitspielern** (wandernde Abenteurer, Weltchat).
Echter Mehrspieler bräuchte einen Server (z. B. Node + WebSocket).

## Inhalt
- 3D-Welt: 7 Zonen mit Höhenprofil, Wasser, Lava, Wäldern, Siedlungen mit Fachwerkhäusern, Straßen, Wetter (Schnee, Asche, Glühwürmchen …)
- 4 Klassen (Krieger, Magier, Waldläufer, Priester), je 3 Fertigkeitenbäume mit 15 Fertigkeiten
- ~45 Monstertypen, Elite-Gegner, **13 Bosse** mit Mechaniken (Boden-Warnkreise, Nova, Beschwörungen, Flüche, Raserei)
- 51 Quests, Loot in 5 Seltenheitsstufen, Boss-Unikate, Händler, Sammelberufe, Alchemie, Schmiedekunst, Reittier
- Kantiges UI: Kristall-Anzeigen für Leben/Ressource, Facetten-Fenster, Drag & Drop Aktionsleiste, rotierende Minimap
- Automatisches Speichern (im Profil der App)

## Steuerung
WASD = Bewegen (relativ zur Kamera) · **Rechte Maustaste halten & ziehen = Kamera** · Mausrad = Zoom ·
Linksklick = Bewegen/Anvisieren · Rechtsklick auf Gegner = Angreifen · 1–0 Fertigkeiten · Tab = Ziel · Leertaste = Auto-Angriff ·
R = Reittier · Q/E = Heil-/Manatrank · F = Interagieren · C/B/K/L/M = Fenster · Enter = Chat (`/hilfe`) · F11 = Vollbild

## Technik
`js/data.js` Spieldaten · `js/world.js` Weltgenerierung · `js/game.js` Spiellogik · `js/models.js` 3D-Figuren ·
`js/render.js` 3D-Engine · `js/ui.js` Oberfläche · `electron/main.js` Desktop-Fenster
