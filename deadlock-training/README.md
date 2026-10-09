# Deadlock Trainer

Trainingsmodus **direkt in Deadlock**, auf einem lokalen Offline-Server. Gebaut als Plugin für
[Deadworks](https://github.com/Deadworks-net/deadworks) (Server-Modding für Deadlock, C#).

Du lädst eine normale Map, öffnest per Chat-Befehl ein Menü, das **vor dir in der Welt schwebt**, schießt auf eine
Übung – und bekommst das Ergebnis **im Chat** (Treffer, zu früh/zu spät in ms, Reaktionszeit, Quote).

## Übungen (Version 0.1)

| Befehl | Was passiert |
| --- | --- |
| `!train` | Menü vor dir: auf PARRY / FLICK / TRACK / ENDE schießen |
| `!parry [runden=10] [leicht\|normal\|schwer]` | Rotes `>> <<` = Windup, dann kommt zu einem festen Zeitpunkt der „Treffer“ (`!!!` + Ton). Dein Parry-Fenster muss den Treffer abdecken. Blaues `?` = Finte, **nicht** parieren (normal/schwer). Pro Runde im Chat: Parry / zu früh / zu spät / verpennt, jeweils mit Millisekunden. |
| `!flick [anzahl=20] [stufe]` | Rote Kugeln erscheinen um dein Fadenkreuz; so schnell wie möglich draufschießen. Reaktionszeit steht kurz an der Kugel, am Ende: Treffer, Ø/Median/beste Reaktion, Genauigkeit. |
| `!track [sekunden=30] [stufe]` | Eine Kugel bewegt sich glatt hin und her (grün = du bist drauf). Am Ende: % der Zeit auf dem Ziel, auch nur beim Schießen. |
| `!tstop` | Übung abbrechen |
| `!thero <name>` | Held wechseln, z. B. `!thero wraith` |

Bestwerte pro Stufe werden für die Dauer der Server-Sitzung gemerkt.

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

## Erster Test (5 Minuten) – bitte in dieser Reihenfolge

Die Übungen sind gegen die echte Deadworks-API geschrieben und kompilieren, aber **ich konnte sie nicht im Spiel
ausprobieren**. Diese Stellen sind die wahrscheinlichsten Stolpersteine:

1. **`!ttest`** – blendet 8 s lang „TEXT-TEST“ vor dir ein.
   - Nichts zu sehen → World-Text funktioniert mit der Standardschrift nicht: `!tfont Reaver` (so machen es die
     Deadworks-Beispiele), dann nochmal `!ttest`.
   - Zu sehen, aber von der Seite/gespiegelt → `!tface` (mehrmals, dreht um 90°) bis es lesbar ist.
2. **`!flick 5 leicht`** – wird die Kugel getroffen, wenn du klickst? Falls nicht: `!tinput dwell` (Fadenkreuz
   0,25 s auf die Kugel halten statt klicken) und `!tdebug`, um zu sehen, welche Tasten der Server meldet.
3. **`!parry 5 leicht`** – wird dein Parry erkannt? Das Plugin schaut auf den Parry-Zustand der Engine
   (`ModifierState.ParryActive`). Kommt im Chat immer „VERPENNT“, obwohl du parierst:
   `!tdebug` einschalten, einmal parieren und die Konsole (F7) ansehen. Taucht dort bei `buttons changed=0x…` ein
   Wert auf, der nur beim Parry kommt, setze ihn mit `!tparrykey <hex>` als Parry-Taste.
4. **`!train`** – Menü vor dir; Textfelder anvisieren (werden gelb) und schießen.

Meldet mir, was nicht klappt (am besten mit den `[dbg]`-Zeilen aus der Konsole), dann passe ich es an.

## Zusätzliche Befehle zur Fehlersuche

`!ttest`, `!tface [grad]`, `!tfont <name|default>`, `!tinput <klick|dwell>`, `!tdebug`, `!tparrykey [hex]`

## Was es noch nicht gibt (geplant)

- Echte Gegner/Bots: Melee-Reihen mit mehreren Angreifern, Counterspell gegen echte Fähigkeiten (die Deadworks-API
  hat dafür `ParrySuccess`-/`MeleeAttack`-Events und `npc_*`-Entities; das braucht Tests im Spiel).
- Aim auf echten Hitboxen (Headshots) statt auf Kugeln, Movement-Parcours, Bestwerte, die über Neustarts bleiben.
- Bessere Optik als Text-Kugeln (Partikel/Modelle).

## Aufbau

- `src/Plugin.cs` – Befehle und Hooks (Eingabe, Parry-Zustand, Frame-Schleife)
- `src/Drills.cs` – Menü, Parry-, Flick- und Tracking-Übung
- `src/Util.cs` – Zielgeometrie, Uhr, Eingabezustand, Bestwerte
