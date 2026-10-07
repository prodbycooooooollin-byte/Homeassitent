# Vault Sync (Fabric-Mod, Minecraft 1.21.4)

Sichert deine Singleplayer-Welt automatisch auf deine Vault-Seite – **keine EXE nötig**: Der Mod läuft im Spiel,
startet also von selbst mit Minecraft und wird nur aktiv, wenn du eine **eingetragene** Welt geöffnet hast.

* Alle `intervalMinutes` (Standard 5) sendet er die Statistiken der Welt an `worldSync` (`{key, data}`): Position, XP, Leben,
  Hunger, Spielzeit, Tode, Kills, abgebaute Blöcke, Distanz, Fortschritte, Inventar, Endertruhe, Spielregeln usw.
* Anzeige oben rechts: feiner rotierender Bogen („Sichere Welt" / „Synchronisiere"), danach Häkchen bzw. rotes Kreuz.
* Zusätzlich lädt er alle `zipIntervalMinutes` (Standard 30) die **komplette Welt als ZIP** per `worldUpload` hoch
  (roher ZIP-Body, Header `X-WorldVault-Key`). Die Seite behält die neuesten 3 Sicherungen. Ein letzter Upload erfolgt beim Verlassen der Welt.

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

## Befehle
`/vault sync` (sofort Statistiken + ZIP), `/vault status`, `/vault pause`, `/vault resume`, `/vault reload`.

## Einstellungen
`apiKey`, `worlds`, `intervalMinutes`, `zipBackup` (true/false), `zipIntervalMinutes`, `endpoint`, optional `uploadEndpoint`
(Standard: `endpoint` mit `worldUpload` statt `worldSync`).
