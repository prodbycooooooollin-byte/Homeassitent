# FarmFinder – Minecraft Farm-Browser

Web-App, um Farm-Designs für Minecraft zu finden: „Bone Meal Farm“ eingeben, Version (z. B. 26.3) wählen und passende YouTube-Tutorials bekommen – bewertet nach **Effizienz** und **Schwierigkeit**, mit einer **Item-Checkliste im Kisten-Look** zum Abhaken.

## Starten

```bash
cd farmfinder
npm install
npm run dev        # Entwicklung
npm run build      # Produktions-Build nach dist/ (statisch hostbar)
npm test           # 11 Tests für Parser, Bewertung, Versionen, Stacks
```

## Funktionen

- **Suche** auf Deutsch oder Englisch („Knochenmehl-Farm“, „iron farm“ …), 20 Schnellwahl-Kategorien, Ergebnis-Cache (24 Std.)
- **Versionsfilter** (26.3 … 1.8): Version wird aus Titel/Beschreibung erkannt („1.21.4“, „26.3“, „1.20+“). Videos ohne erkennbare Version lassen sich einblenden.
- **Bewertung** pro Video: Schwierigkeit (Einfach/Mittel/Schwer), Effizienz (★1–5), erkannte Rate („10k/h“). Sortierung: Beste Balance, Effizienteste, Einfachste, Beliebteste, Neueste.
- **Kisten-Checkliste**: Items als Inventarslots (9er-Raster), Klick = abhaken/durchstreichen, Fortschrittsbalken, Mengen mit Stack-/Shulker-Anzeige. Items kommen aus der Videobeschreibung, lassen sich aus Kommentaren einfügen („64x Hopper“, „Observer x 12“) oder manuell ergänzen (DE/EN-Namen).
- **Projekte** mit Fortschritt, Koordinaten und Notizen; **Favoriten**
- **Einkaufsliste**: offene Items aller Projekte, zusammengerechnet
- **Werkzeuge**: Stack-Rechner, Farmdauer-Rechner
- **Backup** (JSON-Export/-Import); alle Daten liegen nur im Browser (localStorage)
- Videos per Link auch **ohne API-Key** hinzufügbar

## YouTube-API-Key

Die automatische Suche nutzt die YouTube Data API v3 direkt aus dem Browser. Key in der Google Cloud Console erstellen, in den Einstellungen eintragen (bleibt lokal). Eine Suche kostet ~101 von 10 000 Tageseinheiten.

## Grenzen

- Schwierigkeit und Effizienz sind **Schätzungen** aus Titel, Beschreibung, Länge, Aufrufen und Likes – keine Messwerte.
- Die Materialliste hängt davon ab, ob der Ersteller sie in die Beschreibung schreibt. Sonst: Liste einfügen oder manuell eintragen. Im Video eingeblendete Listen werden nicht ausgelesen.
- Ein 3D-Modell der Farm ist nicht möglich: YouTube liefert keine Baupläne. (Denkbar später: Litematica-/Schematic-Import.)
- Item-Symbole sind farbige Kürzel-Kacheln, keine Minecraft-Texturen (Urheberrecht).
