# Vault Sync (Fabric-Mod, Minecraft 1.21.4)

Sichert deine Singleplayer-Welt automatisch auf deine Vault-Seite – **keine EXE nötig**: Der Mod läuft im Spiel,
startet also von selbst mit Minecraft und wird nur aktiv, wenn du eine **eingetragene** Welt geöffnet hast.

* Alle `intervalMinutes` (Standard 5) sendet er die Statistiken der Welt an `worldSync` (`{key, data}`): Position, XP, Leben,
  Hunger, Spielzeit, Tode, Kills, abgebaute Blöcke, Distanz, Fortschritte, Inventar, Endertruhe, Spielregeln usw.
* Anzeige oben rechts: feiner rotierender Bogen („Sichere Welt" / „Synchronisiere"), danach Häkchen bzw. rotes Kreuz.
* **Weltdateien (ZIP) werden noch nicht hochgeladen** – `worldSync` nimmt keine Dateien an. Der ZIP-Code ist fertig, aber
  mit `zipBackup=false` abgeschaltet, bis die Seite eine Upload-Schnittstelle hat (siehe unten).

## Einrichten
1. Fabric Loader + Fabric API für 1.21.4 installieren, `vault-sync-1.0.0.jar` in `mods/` legen.
2. Einmal starten → `config/vaultsync.properties` wird angelegt. Eintragen:
   ```
   apiKey=DEIN_ZUGANGSCODE
   worlds=Meine Welt        # Ordnername aus .minecraft/saves, mehrere kommagetrennt
   ```
3. Auf der Seite muss schon eine Sicherung existieren (sonst 404). Welt öffnen – fertig.

Hinweis: `worldSync` hat keine Welt-Zuordnung, alles geht in die neueste Sicherung. Trage deshalb nur die Welt ein, die du dort pflegst.

## Bauen
`gradle build` (Loom braucht Zugriff auf maven.fabricmc.net) → `build/libs/vault-sync-1.0.0.jar`.
Kern-Tests: `gradle test` (läuft ohne Minecraft-Logik).

## Für spätere ZIP-Backups
Die Seite braucht dafür eine neue Funktion (Datei-Upload, ein Eintrag pro Welt, alte Version ersetzen). Der Mod ist auf diese
**angenommene** Form vorbereitet (`core/VaultClient.upload`): `POST`, `Authorization: Bearer <key>`, multipart mit `worldId`,
`fingerprint`, `replacePrevious=true` und Datei `file`. Sobald sie existiert: `zipBackup=true` und ggf. `VaultClient` anpassen.
