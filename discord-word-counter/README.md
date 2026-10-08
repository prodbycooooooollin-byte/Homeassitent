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

## Befehle
`/join`, `/leave`, `/leaderboard`, `/stats [person]`, `/optout`, `/optin`

## Wichtig
- Alle Mitglieder müssen wissen und einverstanden sein, dass der Kanal ausgewertet wird. Der Bot postet beim Beitritt einen Hinweis; `/optout` stoppt die Erfassung und löscht die Daten der Person.
- Die Erkennung ist nicht perfekt: Whisper kann Wörter überhören oder verändern. Ein größeres Modell (`WHISPER_MODEL=medium`) erhöht die Trefferquote.
- Tests: `pytest tests`
