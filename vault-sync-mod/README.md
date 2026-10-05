# Vault Sync (Fabric-Mod, Minecraft 1.21.4)

Sichert deine Singleplayer-Welt automatisch auf deine Vault-Seite – **keine EXE nötig**: Der Mod läuft im Spiel,
startet also von selbst mit Minecraft und wird nur aktiv, wenn du eine **eingetragene** Welt geöffnet hast.

* Alle `intervalMinutes` (Standard 5): Welt speichern → kurz einfrieren → zippen → hochladen. Unveränderte Welt wird übersprungen.
* Beim Verlassen der Welt: ein letzter, vollständig gespeicherter Stand.
* Anzeige oben rechts: feiner rotierender Bogen („Sichere Welt" / „Synchronisiere"), danach Häkchen bzw. rotes Kreuz.
* Alte Version ersetzt die Seite (Client sendet `replacePrevious=true`).

## Einrichten
1. Fabric Loader + Fabric API für 1.21.4 installieren, `vault-sync-1.0.0.jar` in `mods/` legen.
2. Einmal starten → `config/vaultsync.properties` wird angelegt. Eintragen:
   ```
   apiKey=DEIN_SCHLÜSSEL
   world.Meine\ Welt=WELT_ID_AUF_DER_SEITE   # Ordnername aus .minecraft/saves
   ```
3. Welt öffnen – fertig.

## Bauen
`gradle build` (Loom braucht Zugriff auf maven.fabricmc.net) → `build/libs/vault-sync-1.0.0.jar`.
Kern-Tests: `gradle test` (läuft ohne Minecraft-Logik).

## Upload-Protokoll (Annahme!)
`POST {endpoint}`, `Authorization: Bearer <apiKey>`, multipart: `worldId`, `fingerprint`, `replacePrevious=true`, Datei `file` (world.zip).
Abweichungen nur in `core/VaultClient.java` anpassen.
