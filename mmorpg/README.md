# Aethermoor – Die Schattenkrone

Ein Mittelalter-/Fantasy-MMORPG im Browser (HTML5 Canvas, reines JavaScript, kein Build-Schritt).
Öffne `index.html` in einem modernen Browser – fertig.

## Hinweis zum "MMO"
Die Welt ist ein **Einzelspieler-Spiel mit simulierten Mitspielern** (wandernde Abenteurer, Weltchat).
Echter Mehrspieler bräuchte einen Server (z. B. Node + WebSocket); die Spiellogik ist dafür bewusst getrennt.

## Inhalt
- 4 Klassen (Krieger, Magier, Waldläufer, Priester), je 3 Fertigkeitenbäume mit 15 Fertigkeiten (Ränge, Passive, Ultimates)
- Große Welt mit 7 Zonen, 7 Siedlungen (sichere Zonen), Straßen, Tag/Nacht, Minimap & Weltkarte
- ~45 Monstertypen, Elite-Gegner, **13 Bosse** mit Mechaniken (Boden-Telegraphen, Nova, Beschwörungen, Flüche, Raserei)
- 51 Quests mit Questketten, Tracker, NPC-Markierungen (! und ?)
- Loot in 5 Seltenheitsstufen, Boss-Unikate, Ausrüstung, Händler, Sammelberufe, Alchemie & Schmiedekunst, Reittier
- Klassische MMORPG-Oberfläche: Spieler-/Zielfenster, Aktionsleiste (Drag & Drop), Chat, Inventar, Charakter, Questlog
- Automatisches Speichern (localStorage)

## Steuerung
WASD / Linksklick = Bewegen · Linksklick auf Gegner = Anvisieren · Rechtsklick = Angreifen · 1–0 Fertigkeiten ·
Tab = Ziel · Leertaste = Auto-Angriff · R = Reittier · Q/E = Heil-/Manatrank · F = Interagieren ·
C/B/K/L/M = Fenster · Enter = Chat (`/hilfe`)
