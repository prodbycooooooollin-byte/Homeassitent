# Deadlock Trainer

Trainingsmodus **direkt in Deadlock**, auf einem lokalen Offline-Server. Gebaut als Plugin für
[Deadworks](https://github.com/Deadworks-net/deadworks) (Server-Modding für Deadlock, C#).

Du lädst eine normale Map, öffnest per Chat-Befehl ein Menü, das **vor dir in der Welt schwebt**, schießt auf eine
Übung – und bekommst das Ergebnis **im Chat** (Treffer, zu früh/zu spät in ms, Reaktionszeit, Quote).

## Übungen (Version 0.3)

Sobald du mit einem Helden spawnst, baut sich vor dir ein **Menü** auf. Es bleibt stehen. Du schießt auf eine Übung
und wirst automatisch in einen **freien Bereich** der Map gebracht (die Arena wird per Raycasts selbst gesucht, du musst
nichts einstellen). Nach der Übung geht es zurück zum Menü. Unten im Menü wählst du die **Stufe** (LEICHT / NORMAL / SCHWER).

Die Gegner sind **echte Bot-Helden** (Fake-Clients mit einem echten Helden, standardmäßig Infernus): sichtbar, mit echten
Hitboxen, und sie schlagen **wirklich** zu. Das Plugin steuert sie (Position, Blickrichtung, Angriffszeitpunkt).

| Kategorie | Übung | Was passiert |
| --- | --- | --- |
| PARRY | **Einzel** | Ein Bot steht vor dir und schlägt in unregelmäßigen Abständen zu. Du parryst. |
| PARRY | **Mehrere** | Drei Bots im Halbkreis, zufällig schlägt einer zu. |
| PARRY | **Salve** | Mehrere Schläge direkt hintereinander (3 / 4 / 5 je nach Stufe). |
| AIM | **Flick** | Der Bot springt an neue Stellen um dich herum. Treffen = Punkt + Reaktionszeit (echter Schaden zählt). |
| AIM | **Strafe** | Der Bot läuft gleichmäßig hin und her. Fadenkreuz draufhalten und schießen. |
| AIM | **Zufall** | Wie Strafe, aber ruckartige Richtungswechsel. |

Im Chat bekommst du pro Schlag: **PARRY!** mit Druckpunkt in ms zum Treffer, oder **GETROFFEN** mit „zu früh / zu spät / kein
Parry“. Am Ende Quote, Ø Druckpunkt, Bestwert. Beim Aim: Reaktionszeit pro Treffer (über dem Bot), am Ende Trefferquote bzw.
„% der Zeit auf dem Ziel“ (live über dem Bot angezeigt). Bots können dich in der Übung nicht töten (Schaden wird geblockt).

**Stufen:** leicht = lange Vorwarnung (rotes `>>` über dem Kopf), große Abstände; normal = kurze Vorwarnung; schwer = keine
Vorwarnung (Animation lesen), kurze Abstände, schnellere/weitere Aim-Ziele.

| Befehl | Zweck |
| --- | --- |
| `!train` / `!train off` | Menü hier aufbauen / ausschalten |
| `!parry [einzel\|mehrere\|salve] [runden] [stufe]` | Parry direkt starten |
| `!flick [anzahl] [stufe]`, `!track [strafe\|zufall] [sekunden] [stufe]` | Aim direkt starten |
| `!tlevel leicht\|normal\|schwer` | Standard-Stufe |
| `!tstop` | Übung abbrechen |
| `!tbot test` | **Bot-Selbsttest**: erzeugt einen Bot, lässt ihn zuschlagen, berichtet im Chat |
| `!tbot hero <name>` | Bot-Held wechseln (Inferno, Wraith, Haze, Ghost, Hornet, Atlas, ...) |
| `!tbot off` | Notfall: ohne Bots, mit Text-Zielen |
| `!tarena` / `!tarena reset` | *Optional*: eigene Arena festlegen / wieder automatisch |
| `!tcvars bot` | Sucht Konsolenbefehle/-variablen mit „bot“ und schreibt `trainer_cvars.txt` |

Bestwerte pro Übung und Stufe werden für die Dauer der Server-Sitzung gemerkt.

## Installation (Windows)

Voraussetzungen: Deadlock (Steam), [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).

1. **Deadworks besorgen.** Zuerst bei den
   [GitHub-Releases](https://github.com/Deadworks-net/deadworks/releases) nachsehen. Gibt es dort nichts Passendes,
   Deadworks wie in dessen README aus dem Quellcode bauen (Visual Studio + protobuf, ca. 30 Minuten).
   Danach liegt `deadworks.exe` in `…\Deadlock\game\bin\win64\`.
2. **Plugin bauen** (in PowerShell, in diesem Ordner `deadlock-training`):
   ```
   dotnet build -c Release -p:DeadlockDir="C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\bin\win64"
   ```
   Das kopiert `DeadlockTrainer.dll` nach `…\win64\managed\plugins\`. (Liegt die `DeadworksManaged.Api.dll`
   woanders, mit `-p:DeadworksApiDll=<Pfad>` angeben.)
3. **Server starten:** `deadworks.exe` aus `…\win64\` ausführen (Fenster offen lassen).
4. **Deadlock normal starten**, Konsole öffnen (Einstellungen → „Entwicklerkonsole“, dann F7) und:
   ```
   connect localhost:27067
   ```
5. Held wählen, spawnen, im Chat `!train` tippen (oder `!parry`, `!flick`, `!track`).

Der Server läuft nur auf deinem Rechner, es ist kein Online-Spiel und kein Matchmaking.

## Update einspielen (wenn du neuen Code von mir bekommst)

1. Im Ordner des Repos: `git pull`
2. Server-Fenster (`deadworks.exe`) schließen, dann im Ordner `deadlock-training` neu bauen (Befehl wie bei der Installation).
3. `deadworks.exe` neu starten (**Neustart nötig**, sonst wird das Figuren-Modell nicht vorgeladen), in Deadlock `connect localhost:27067`.

## Erster Test (5 Minuten) – bitte in dieser Reihenfolge

Gegen die echte Deadworks-API geschrieben und kompiliert, aber **nicht im Spiel getestet**. Die riskanteste Stelle sind die
Bots, deshalb gibt es einen Selbsttest:

1. **`!tbot test`** – erzeugt einen Bot vor dir und lässt ihn einmal zuschlagen. Im Chat steht Schritt für Schritt:
   Bot da? Held/Team? Schlag ausgeführt? Welche Ereignisse kamen (MeleeAttack, ParrySuccess, Schaden)?
   - **„Kein Bot-Held entstanden“** → `Server.CreateFakeClient` bekommt keinen Slot oder `SelectHero` greift nicht. Schick mir
     den Chat-Text und das Server-Fenster. Bis dahin laufen die Übungen im vereinfachten Modus (Text-Ziele).
   - **„Kein Nahkampf-Ereignis“** → der Bot steht, schlägt aber nicht zu. Dann nutzt Parry automatisch die Simulation
     (Text-Signale + Zeitfenster-Auswertung); schick mir die Ausgabe.
2. **`!train`** → auf *Einzel* schießen: Wirst du teleportiert? Steht ein Bot vor dir, der zuschlägt?
3. **Flick/Strafe** – steht der Bot sichtbar da, und zählt dein Schaden als Treffer?

Meldet mir, was nicht klappt (am besten Chat-Text + Server-Fenster-Ausgabe).

## Zusätzliche Befehle zur Fehlersuche

`!tbot test`, `!tface [grad]`, `!tfont <name|default>`, `!tinput <klick|dwell>`, `!tdebug`, `!tparrykey [hex]`, `!tbot view on|off`, `!tcvars <wort>`

## Was es noch nicht gibt (geplant)

- Counterspell/Fähigkeiten-Übungen gegen Bots, Headshot-Auswertung, Movement-Parcours, Bestwerte über Neustarts.
- Mehr Aim-Szenarien (Peek, Mehrfachziele, Distanzstufen) und eine „Reaktion“-Übung.
- Eigene Optik/UI (aktuell Text im Raum und Chat).

## Aufbau

- `src/Plugin.cs` – Befehle und Hooks (Eingabe, Parry-Zustand, Frame-Schleife)
- `src/Drills.cs` – Basisklasse und Menü; `src/ParryDrill.cs` – Parry; `src/AimDrills.cs` – Flick, Tracking, Bot-Selbsttest
- `src/Bots.cs` – Bot-Verwaltung (Fake-Clients), `src/Config.cs` – Einstellungen und Schwierigkeits-Zahlen
- `src/Arena.cs` – Arena speichern und automatisch freien Platz suchen
- `src/Util.cs` – Zielgeometrie, Uhr, Eingabezustand, Bestwerte
