# Deadlock Trainer

Trainingsmodus **direkt in Deadlock**, auf einem lokalen Offline-Server. Gebaut als Plugin für
[Deadworks](https://github.com/Deadworks-net/deadworks) (Server-Modding für Deadlock, C#).

Du lädst eine normale Map, öffnest per Chat-Befehl ein Menü, das **vor dir in der Welt schwebt**, schießt auf eine
Übung – und bekommst das Ergebnis **im Chat** (Treffer, zu früh/zu spät in ms, Reaktionszeit, Quote).

## Übungen (Version 0.2)

Sobald du mit einem Helden spawnst, baut sich vor dir ein **Menü** auf (PARRY / FLICK / TRACK / MENÜ AUS). Es bleibt
stehen. Du schießt auf eine Übung und wirst in eine **freie Arena** teleportiert (automatisch gesucht, oder mit
`!tarena` selbst festgelegt). Nach der Übung geht es zurück zum Menü. Alle Ziele sind **echte 3D-Figuren**
(Werewolf-Modell), keine Text-Kugeln mehr.

| Befehl | Was passiert |
| --- | --- |
| `!train` | Menü hier und jetzt aufbauen. `!train off` schaltet es aus. |
| `!parry [runden=10] [leicht\|normal\|schwer] [angreifer=3]` | Angreifer stehen um dich herum. Einer leuchtet **rot** (holt aus) und schlägt kurz darauf zu (Ausfall + Ton). Dein Parry-Fenster muss den Schlag abdecken. **Blau** = Finte, nicht parieren. Pro Runde im Chat: Parry / zu früh / zu spät / verpennt in ms, am Ende Quote. |
| `!flick [anzahl=20] [stufe]` | Figuren erscheinen um dich herum; so schnell wie möglich draufschießen. Reaktionszeit steht kurz über der Figur, am Ende Treffer, Ø/Median/beste Reaktion, Genauigkeit. |
| `!track [sekunden=30] [stufe]` | Eine Figur läuft hin und her (grün = du bist drauf). Am Ende: % der Zeit auf dem Ziel, auch nur beim Schießen. |
| `!tstop` | Übung abbrechen (zurück zum Menü) |
| `!tarena` / `!tarena reset` | Aktuelle Position als Arena speichern (pro Map, bleibt nach Neustart) / wieder automatisch suchen |
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

## Update einspielen (wenn du neuen Code von mir bekommst)

1. Im Ordner des Repos: `git pull`
2. Server-Fenster (`deadworks.exe`) schließen, dann im Ordner `deadlock-training` neu bauen (Befehl wie bei der Installation).
3. `deadworks.exe` neu starten (**Neustart nötig**, sonst wird das Figuren-Modell nicht vorgeladen), in Deadlock `connect localhost:27067`.

## Erster Test (5 Minuten) – bitte in dieser Reihenfolge

Die Übungen sind gegen die echte Deadworks-API geschrieben und kompilieren, aber **ich konnte sie nicht im Spiel
ausprobieren**. Wahrscheinlichste Stolpersteine:

1. **`!ttest`** – zeigt 8 s lang eine Figur und den Text „TEXT-TEST“.
   - Keine Figur → `!tmodel default` ausprobieren oder ein anderes Modell mit `!tmodel <pfad.vmdl>` setzen und die
     Meldung im Server-Fenster ansehen.
   - Text gespiegelt/seitlich → `!tface` (mehrmals, dreht um 90°), dann `!train` neu tippen.
   - Kein Text → `!tfont Reaver`.
2. **`!flick 5 leicht`** – wird die Figur getroffen, wenn du klickst? Falls nicht: `!tinput dwell`.
3. **`!parry 5 leicht`** – wird dein Parry erkannt? Kommt immer „VERPENNT“: `!tdebug` einschalten, einmal parieren, Konsole (F7)
   ansehen. Taucht bei `buttons changed=0x…` ein Wert auf, der nur beim Parry kommt: `!tparrykey <hex>`.
4. **Menü & Arena** – auf PARRY schießen: Wirst du teleportiert? Landest du an einem sinnvollen Ort? Sonst `!tarena`
   an einem freien Platz.

Meldet mir, was nicht klappt (am besten mit den `[dbg]`-Zeilen und der Server-Fenster-Ausgabe).

## Zusätzliche Befehle zur Fehlersuche

`!ttest`, `!tface [grad]`, `!tfont <name|default>`, `!tmodel <pfad|default> [brusthöhe]`, `!tinput <klick|dwell>`, `!tdebug`, `!tparrykey [hex]`

## Was es noch nicht gibt (geplant)

- Echte Gegner/Bots: Melee-Reihen mit mehreren Angreifern, Counterspell gegen echte Fähigkeiten (die Deadworks-API
  hat dafür `ParrySuccess`-/`MeleeAttack`-Events und `npc_*`-Entities; das braucht Tests im Spiel).
- Aim auf echten Hitboxen (Headshots), Animationen der Angreifer, Movement-Parcours, Bestwerte über Neustarts.

## Aufbau

- `src/Plugin.cs` – Befehle und Hooks (Eingabe, Parry-Zustand, Frame-Schleife)
- `src/Drills.cs` – Menü, Parry-, Flick- und Tracking-Übung
- `src/Arena.cs` – Arena speichern und automatisch freien Platz suchen
- `src/Util.cs` – Zielgeometrie, Uhr, Eingabezustand, Bestwerte
