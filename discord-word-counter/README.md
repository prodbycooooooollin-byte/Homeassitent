# Discord Word Counter

Bot, der in einem Sprachkanal zuhört und pro Person zählt, wie oft ein bestimmtes Wort gesagt wird. Die Rangliste gibt es per `/leaderboard`.

## Funktionsweise
Discord-Audio pro Sprecher -> lokale Spracherkennung (faster-whisper) -> Wortabgleich (`matcher.py`) -> Zähler in SQLite.
Audio und Transkripte werden **nicht gespeichert**, nur die Anzahl pro Person.

## Einrichtung
1. Im [Developer Portal](https://discord.com/developers/applications) eine App + Bot anlegen, Token kopieren, **Server Members Intent** aktivieren.
2. Einladen mit den Scopes `bot` + `applications.commands` und den Rechten *Connect*, *View Channels*, *Send Messages*.
3. `cp .env.example .env`, Token eintragen.
4. `pip install -r requirements.txt` (benötigt `libopus` und `ffmpeg` auf dem System), dann `python bot.py`.

## Als EXE (Windows)
Im GitHub-Repo unter *Actions -> Build Discord Word Counter EXE -> Run workflow* starten, danach unter *Artifacts* `DiscordWordCounter` herunterladen und entpacken. Die EXE doppelklicken: Beim ersten Start fragt sie nach dem Bot-Token und speichert ihn in einer `.env` neben der EXE. Sie startet Bot und Dashboard zusammen (http://127.0.0.1:8080). Der Token ist bewusst nicht eingebaut.

## Dashboard
`python dashboard.py` startet eine Webseite (Standard: http://127.0.0.1:8080) mit Rangliste, Anteil pro Person, Treffern nach Uhrzeit und Wochentag, den letzten 30 Tagen, Rekordtag, Tage-Serie und der Lieblings-Uhrzeit pro Person.
Der Bot (`bot.py`) und das Dashboard (`dashboard.py`) sind zwei getrennte Prozesse, die dieselbe `counter.db` nutzen. Beide müssen laufen.
Einstellungen in `.env`: `DASHBOARD_HOST`, `DASHBOARD_PORT`, `DASHBOARD_PASSWORD`, `TIMEZONE`.
Uhrzeit-Statistiken gibt es erst für Treffer ab dieser Version, weil dafür jeder Treffer mit Zeitstempel gespeichert wird.

## Befehle
`/join`, `/leave`, `/leaderboard`, `/stats [person]`, `/optout`, `/optin`

## Wichtig
- Alle Mitglieder müssen wissen und einverstanden sein, dass der Kanal ausgewertet wird. Der Bot postet beim Beitritt einen Hinweis; `/optout` stoppt die Erfassung und löscht die Daten der Person.
- Die Erkennung ist nicht perfekt: Whisper kann Wörter überhören oder verändern. Ein größeres Modell (`WHISPER_MODEL=medium`) erhöht die Trefferquote.
- Tests: `pytest tests`
