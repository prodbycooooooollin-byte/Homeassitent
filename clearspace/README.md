# Clearspace

Intelligenter Desktop-Aufräumer für Windows 11. Clearspace kombiniert drei Dinge:
einen **Launcher**, eine **virtuelle Bibliothek** und einen **kontrollierten Aufräumer**.

Virtuelle Kategorien sind die primäre Organisation: Ein Eintrag kann mehreren Kategorien
angehören, ohne dass seine Datei mehrfach existiert oder verschoben wird. Ordner sind eine
optionale Ausgabeform, nicht das Datenmodell.

---

## Architekturentscheidung

C# / .NET 8 mit WPF, aufgeteilt in vier Projekte:

| Projekt | Ziel | Zweck |
|---|---|---|
| `src/Clearspace.Core` | `net8.0` | Datenmodell, Erfassung, Kategorisierung, Regeln, Planung, Journal, Ausführung, Suche, SQLite. Vollständig über Abstraktionen (`IFileSystem`, `IShortcutResolver`, `IScanSourceProvider`, `ILauncher`). |
| `src/Clearspace.Presentation` | `net8.0` | Alle Ansichtsmodelle und Abläufe der Oberfläche – bewusst ohne WPF-Abhängigkeit, damit sie automatisiert testbar sind. |
| `src/Clearspace.Windows` | `net8.0-windows` | Dokumentierte Windows-Schnittstellen: `SHGetKnownFolderPath`, `IShellLink`, `FileVersionInfo`, Uninstall-Schlüssel der Registrierung, `SHOpenFolderAndSelectItems`, `FileSystemWatcher`. |
| `src/Clearspace.App` | `net8.0-windows`, WPF | Oberfläche, Infobereichssymbol, globaler Tastenkürzel, Iconladung. |

Der Aufbau trennt Erfassung, Normalisierung, Kategorisierung, Regeln, Suche, Startaktionen,
Planung, Ausführung, Journal und Oberfläche. Es gibt keine DLL-Injection, keine Explorer-Hacks
und keinen Ersatz der Windows-Shell. Clearspace läuft ohne Administratorrechte (`asInvoker`).

---

## Bauen und starten

Voraussetzung: Windows 10/11 und das **.NET 8 SDK**.

```powershell
git clone <dieses Repository>
cd clearspace

# Alles bauen (inklusive Oberfläche)
dotnet build Clearspace.sln -c Release

# Tests ausführen
dotnet test tests/Clearspace.Core.Tests/Clearspace.Core.Tests.csproj -c Release

# Starten
dotnet run --project src/Clearspace.App/Clearspace.App.csproj -c Release
```

### Ausführbares Paket erzeugen

```powershell
dotnet publish src/Clearspace.App/Clearspace.App.csproj -c Release -r win-x64 `
  --self-contained false -p:PublishSingleFile=true -o artifacts/clearspace
```

Ergebnis: `artifacts/clearspace/Clearspace.exe`. Mit `--self-contained true` entsteht ein Paket,
das ohne installierte .NET-Laufzeit startet.

### Ohne Windows (nur Kern und Ansichtsmodelle)

```bash
dotnet test Clearspace.Core.sln
```

Diese Projektmappe enthält `Clearspace.Core`, `Clearspace.Presentation` und die Tests. Sie baut
und läuft auf Linux und macOS – nützlich für CI und Entwicklung.

---

## Erster Start

1. **Quellen zeigen** – Clearspace liest die Desktop-Pfade über Windows Known Folders,
   einschließlich umgeleiteter und OneDrive-Desktops sowie des öffentlichen Desktops.
   Es wird nie ungefragt die Festplatte durchsucht.
2. **Erfassen** – Verknüpfungen werden nur zur Analyse aufgelöst, nichts wird gestartet.
3. **Vorschläge prüfen** – jede Zuordnung trägt eine kurze Begründung und eine Sicherheitsstufe.
4. **Aufräummodus wählen** – Bibliothek, klassische Ordner oder nur Sichtbarkeit.
5. **Vorschau bestätigen** – erst danach wird überhaupt etwas im Dateisystem bewegt.

Die Bibliothek liegt dauerhaft unter `%USERPROFILE%\Clearspace\Bibliothek`, die Datenbank unter
`%APPDATA%\Clearspace\clearspace.db`. Weder Cache noch Temp-Verzeichnis.

---

## Tatsächlich implementierte Funktionen

### Erfassung
- Desktop über Known Folders, zusätzlich OneDrive-Desktops und öffentlicher Desktop (lesend).
- Startmenü und installierte Anwendungen (Uninstall-Schlüssel) optional, ausschließlich lesend.
- Auflösung von `.lnk` über `IShellLink` (ohne Oberfläche, ohne Rückschreiben) und `.url` über ihr INI-Format.
- Erfasst: Name, Icon-Ort, Typ, Pfad, Ziel, Argumente, Arbeitsverzeichnis, Herausgeber,
  Produktbeschreibung, Endung, Protokoll bzw. App-Identität, Herkunft.
- Unterscheidet Programm-, Spiel- und Internetverknüpfungen, installierte und portable Programme,
  Projektdateien, Dokumente, Ordner, Plugins, Presets, Samples, Medien, Archive, Installer und
  besondere Windows-Symbole.
- Verknüpfungen auf dasselbe Ziel werden zusammengefasst; unterschiedliche Startparameter oder
  Arbeitsverzeichnisse bleiben getrennte Startprofile.
- Cloud-Platzhalter, Symlinks und Junctions werden erkannt und nicht angefasst.

### Kategorisierung
- Mehrere Signale: Produktname, Metadaten, Herausgeber, Verknüpfungsziel, Protokoll, Dateityp,
  Ablageort und lokale Zuordnungstabelle (`Resources/knowledge.json`, eingebettet, offline).
- Mehrfachzuordnung: OBS erscheint z. B. unter *Streaming* und *Gaming-Hilfsprogramme*,
  Audiointerface-Software unter *Musikproduktion* und *Geräte*.
- Jede Zuordnung nennt ihre Begründung und eine Sicherheitsstufe (sicher / wahrscheinlich / unsicher).
  Das sind Heuristiken, keine berechneten Wahrscheinlichkeiten.
- Ohne belastbare Hinweise landet ein Eintrag sichtbar unter **Noch zuordnen**. Es wird nichts erfunden.
- Leere Unterkategorien werden nicht angezeigt.

### Regeln und Korrekturen
- Rangfolge: **manuelle Festlegung → Regel → automatischer Vorschlag**. Manuelle Zuordnungen
  überleben Rescan und Neustart.
- Nach einer Korrektur schlägt Clearspace Regeln vor – zuerst die enge (nur dieser Eintrag).
  Die Herstellerregel ist ein eigener, ausdrücklich zu bestätigender Vorschlag: eine Einzelkorrektur
  sortiert niemals still alle Produkte desselben Herstellers um.
- Regeln sind priorisierbar, abschaltbar und besitzen eine Vorschau. Bei Überschneidungen wird
  verständlich erklärt, welche Regel gilt.
- Effekte: Hauptkategorie setzen, zusätzlich anzeigen, immer auf dem Desktop lassen,
  von Dateiaktionen ausnehmen, automatische Dateiaktionen erlauben.

### Aufräumen
- **A – Bibliothek (empfohlen):** ausgewählte Desktop-Verknüpfungen wandern in ein dauerhaftes
  Benutzerverzeichnis und bleiben im Launcher startbar.
- **B – Klassische Ordner:** wenige Themenordner direkt auf dem Desktop.
- **C – Sichtbarkeit:** ausdrücklich als **manuell** gekennzeichnet, siehe Grenzen.
- Verschoben wird ausschließlich die Verknüpfungsdatei, nie das Zielprogramm. Argumente und
  Arbeitsverzeichnis bleiben erhalten.
- Übersprungen werden begründet: Plugins, Presets, Samples, Projektdateien, portable und
  installierte Programme, Ordner, Windows-Symbole, relative Zielpfade, laufwerksübergreifende
  Ziele, Cloud-Platzhalter, Verweise und der öffentliche Desktop (fehlende Rechte).
- Nach der Aktion zeigt Clearspace getrennt: was verschoben wurde, was nur virtuell einsortiert
  wurde und was aus welchem Grund sichtbar auf dem Desktop bleibt.

### Sicherheit der Dateiaktionen
- Das Journal wird **vor** Beginn vollständig geschrieben und nach jedem Schritt aktualisiert.
- Unmittelbar vor der Ausführung wird geprüft, ob die Quelle noch zum Plan passt (Größe und
  Zeitstempel). Abweichungen führen zum Überspringen mit Erklärung.
- Namenskonflikte werden nachvollziehbar ausgewichen (`Name (2).lnk`). Es wird **nie** überschrieben.
- **Rückgängig** funktioniert nach einem Neustart, weil nur das dauerhafte Journal ausgewertet wird.
  Ist der ursprüngliche Ort inzwischen belegt, bleiben beide Inhalte erhalten und der Konflikt wird gezeigt.
- Nach Absturz oder Abbruch rekonstruiert Clearspace den tatsächlichen Zustand, indem es nachsieht,
  wo die Datei wirklich liegt – Aktionen werden nie blind wiederholt.

### Launcher
- Tippfehlertolerante Suche (Damerau-Levenshtein, Wortanfänge, Initialen, Teilfolgen,
  Mehrwortanfragen) über Namen, Dateinamen, Tags, Kategorien und Herausgeber.
- Favoriten, zuletzt und häufig geöffnet – ausschließlich auf Basis von Starts **aus Clearspace**.
  Es gibt keine Prozessbeobachtung. Die Statistik ist abschaltbar und löschbar.
- Tastatursteuerung (Pfeiltasten, Eingabe, Escape), Kontextmenü, Infobereichssymbol,
  konfigurierbarer globaler Tastenkürzel mit Konflikterkennung.
- Starts laufen über die Shell-Zuordnung (`UseShellExecute`), damit Verknüpfungen, Protokolle wie
  `steam://` und registrierte Anwendungen korrekt funktionieren. Es werden keine Kommandozeilen aus
  Dateinamen zusammengebaut.
- Plugins, Presets und Samples werden nicht als startbare Programme behandelt, sondern erklärt.
- Vor dem Start unbekannter ausführbarer Dateien wird gezeigt, was genau startet.

### Automatik
- Ereignisbasierte Überwachung mit Entprellung, Stabilitätsprüfung (abgeschlossener Schreibvorgang),
  Zusammenfassung doppelter Ereignisse und ergänzendem Abgleich.
- Eigene Aktionen werden angemeldet und lösen keine Reaktion aus – es entstehen keine Schleifen.
- **Standard: nur indexieren.** Dateiaktionen im Hintergrund brauchen eine ausdrücklich aktivierte
  Regel *und* eine sichere Zuordnung. Unklares bleibt im Eingang.
- Pausieren, Ausschlüsse und manueller Rescan sind vorhanden.

### Datenschutz und Leistung
- Alles läuft lokal und offline. Keine Übertragung von Pfaden, Namen oder Inhalten.
  Es ist keine KI-Klassifikation aktiv oder erforderlich.
- Bibliothek, Regeln und Journal in SQLite (WAL, `synchronous=FULL`).
- Icons werden asynchron und gedrosselt geladen und zwischengespeichert; die Oberfläche blockiert nicht.
- Sample-Bibliotheken werden nicht Datei für Datei als Kacheln aufgenommen.

---

## Grenzen und was einen Windows-Test braucht

Diese Punkte sind bewusst benannt, statt sie zu beschönigen:

1. **Visuell leerer Desktop (Modus C) ist manuell.** Windows bietet keine dokumentierte, stabile
   Schnittstelle zum Ein- und Ausblenden aller Desktop-Symbole. Die verbreitete Methode schickt
   interne Nachrichten an das Explorer-Fenster `SHELLDLL_DefView` – ein nicht unterstützter Eingriff.
   Clearspace führt diesen Schritt deshalb nicht aus, erklärt den Windows-Weg und öffnet auf Wunsch
   die Einstellungen. Keine simulierte Automatik.
2. **Auf Windows gebaut und getestet, aber nicht von Hand bedient.** Die Entwicklungsumgebung
   dieses Auftrags läuft auf Linux. Für echte Verifikation läuft der Workflow
   `.github/workflows/clearspace-windows.yml` auf `windows-latest`. Dort sind **grün**:
   der Build der gesamten Projektmappe einschließlich der WPF-Oberfläche, alle 33 Tests und
   die Erzeugung des ausführbaren Pakets (als Artefakt `clearspace-win-x64` herunterladbar).
   Was damit **nicht** geprüft ist, weil es einen Menschen an einem echten Rechner braucht:
   Auflösung echter `.lnk`-Dateien, Icon-Extraktion, Registrierung des Tastenkürzels,
   Infobereichssymbol, Startverhalten von Steam- und Protokollverknüpfungen sowie das
   Verhalten auf einem OneDrive-Desktop.
3. **Dateisortiermodus für gewöhnliche Dateien** ist nicht implementiert. Echte Dateien werden
   ausschließlich virtuell einsortiert. Das ist die sichere Variante und wurde bewusst so gewählt;
   der Plan- und Journalweg ist dafür bereits vorbereitet (`PlannedActionKind.MoveFile`).
4. **Kategorien per Drag-and-drop sortieren, eigene Farben und Icons** sind im Datenmodell und in
   der Speicherung vollständig vorhanden (`Category.SortOrder`, `Color`, `Icon`, `IsHidden`),
   in der Oberfläche aber noch nicht als Bedienung ausgeführt.
5. **Leistungsziele** (Launcher in 300 ms sichtbar, Suche unter 100 ms bei einigen Tausend
   Einträgen) sind **Ziele**, keine gemessenen Werte. Auf einem Windows-Rechner sind sie zu messen.
6. Der öffentliche Desktop wird gelesen, aber nie verändert: Clearspace eskaliert keine Rechte.

---

## Geprüfte Abnahmefälle

Alle Tests laufen in isolierten Testverzeichnissen bzw. einem nachgebildeten Dateisystem. Der echte
Entwicklungsdesktop wird nie verändert. Stand: **33 Tests, alle grün – auf Linux und auf Windows**.

| # | Fall | Test |
|---|---|---|
| 1 | FL Studio → Musikproduktion, unbekanntes Tool → Eingang | `Fall01_...` |
| 2 | Mehrfachzuordnung ohne zweite Datei | `Fall02_...` |
| 3 | Verschobener Spiele-Shortcut behält Argumente und Arbeitsverzeichnis | `Fall03_...` |
| 4 | Plugin-Datei wird weder verschoben noch als App behandelt | `Fall04_...` |
| 5 | Musikprojekt und Samples bleiben unverändert | `Fall05_...` |
| 6 | Manuelle Korrektur überlebt Rescan und Neustart (echte SQLite-Datei) | `Fall06_...` |
| 7 | Namenskonflikte überschreiben nie | `Fall07_...` |
| 8 | Rückgängig nach Neustart, belegter Originalpfad | `Fall08_...` |
| 9 | Abbruch ergibt rekonstruierbares Journal | `Fall09_...` |
| 10 | Öffentlicher Desktop wird gelesen, nicht verändert | `Fall10_...` |
| 11 | Überwachung: neue und gelöschte Einträge, keine Schleifen | `Fall11_...` |
| 12 | Ohne aktivierte Regel nur Indexierung | `Fall12_...` |
| 13 | Kategorien mit echten Daten, offline, keine Beispieldaten | `Fall13_...` |
| 14 | Ergebnis zeigt Entferntes, Verbliebenes und den Weg zurück | `Fall14_...` |

Ergänzend: vollständiger Ablauf über die Ansichtsmodelle (erfassen → zuordnen → Vorschau →
verschieben → starten → rückgängig), Suchqualität, Ordnermodus, Sichtbarkeitsmodus, Rangfolge
manuell vor Regel, Schutzregeln und Regelvorschau. Dazu sicherheitskritische Randfälle:
Laufwerksgrenze, relative Zielpfade, Cloud-Platzhalter, Verweise, zwischenzeitlich geänderte
oder verschwundene Quellen, getrennte Startprofile und kollisionsfreie Zielpfade.

Fall 10 und 11 sind in der Logik geprüft; das Verhalten echter OneDrive-Pfade und echter
Dateisystemereignisse gehört zusätzlich auf einen Windows-Rechner.

---

## Was Clearspace bewusst nicht tut

Keine Registry-Reinigung, kein Arbeitsspeicher-Beschleuniger, keine automatische Deinstallation,
keine angebliche Speicheroptimierung, keine DAW-Integration ohne implementierte Schnittstelle,
keine systemweite Nutzungsanalyse und keine funktionslosen Schaltflächen.
