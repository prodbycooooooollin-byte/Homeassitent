# FarmFinder – Minecraft Farm-Browser

Web-App, um Farm-Designs für Minecraft zu finden: „Bone Meal Farm“ eingeben, Version (z. B. 26.3) wählen und passende YouTube-Tutorials bekommen – bewertet nach **Effizienz** und **Schwierigkeit**, mit einer **Item-Checkliste im Kisten-Look** zum Abhaken.

## Starten

```bash
cd farmfinder
npm install
npm run dev        # Entwicklung
npm run build      # Produktions-Build nach dist/ (statisch hostbar)
npm test           # 15 Tests: Parser, Bewertung, Versionen, Stacks, Litematica
npm run electron   # Desktop-App starten
npm run dist:win   # Windows-EXE bauen (Installer + portable)
npm run catalog    # Video-Katalog neu sammeln (braucht YOUTUBE_API_KEY)
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

### Automatisch befüllt

- **Video-Katalog:** Der Workflow `farmfinder-catalog.yml` sammelt wöchentlich Videos für alle Kategorien und committet `public/catalog.json`. Die App zeigt sie sofort an (Startseite pro Kategorie), ohne dass Nutzer einen Key brauchen. Einmalig nötig: Repository-Secret `YOUTUBE_API_KEY`.
- **Litematica-3D-Modell:** Steht ein `.litematic`-Link in Beschreibung oder Kommentaren, wird die Datei geladen und als 3D-Modell angezeigt (Drehen/Zoomen, Schicht-Regler). Aus der Datei wird die **Materialliste exakt berechnet** und automatisch in ein leeres Projekt übernommen. Share-Links (Google Drive, Dropbox, GitHub) werden in Direktlinks umgewandelt. Dateien lassen sich auch per Drag & Drop ablegen.
- **Materialliste:** aus Beschreibung, aus Ersteller-Kommentaren (mit Key), aus der Litematica-Datei oder per **Screenshot-Texterkennung** (Bild einfügen/wählen, läuft lokal mit Tesseract).

## Desktop-App (EXE)

Der Workflow `release-farmfinder.yml` baut auf `windows-latest` Installer und portable EXE und veröffentlicht sie als GitHub-Release (Tag `farm-v<version>`). Die Desktop-App lädt Dateien ohne Browser-Einschränkung (CORS), der Browser kann das bei vielen Hostern nicht.

## YouTube-API-Key

Die automatische Suche nutzt die YouTube Data API v3 direkt aus dem Browser. Key in der Google Cloud Console erstellen, in den Einstellungen eintragen (bleibt lokal). Eine Suche kostet ~101 von 10 000 Tageseinheiten.

## Grenzen

- Schwierigkeit und Effizienz sind **Schätzungen** aus Titel, Beschreibung, Länge, Aufrufen und Likes – keine Messwerte.
- Automatisches Erkennen einer **im Video eingeblendeten** Liste ist nicht möglich: Eingebettete YouTube-Videos erlauben keinen Zugriff auf Bildpunkte, und Videos herunterzuladen verstößt gegen die YouTube-Bedingungen. Ersatz: Screenshot einlesen.
- Ein 3D-Modell gibt es nur, wenn der Ersteller eine Litematica-Datei verlinkt. Hoster mit Vorschauseite (MEGA, MediaFire, Patreon) liefern keinen Direktlink – dann Datei manuell laden und ablegen. Nur `.litematic`, kein `.schem`.
- Item-Symbole sind farbige Kürzel-Kacheln, keine Minecraft-Texturen (Urheberrecht).
