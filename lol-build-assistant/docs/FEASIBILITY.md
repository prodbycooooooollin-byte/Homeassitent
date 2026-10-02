# Machbarkeitsbewertung

Stand: 25.09.2026. Laut Recherche ist 26.19 der aktuelle Patch (Quelle: offizielle Patchnotes 26.19). Wichtige Einschränkung dieser Bewertung: Aus der Entwicklungsumgebung waren `developer.riotgames.com`, `ddragon.leagueoflegends.com` und `static.developer.riotgames.com` gesperrt. Riots Regeln konnten deshalb nur über Suchergebnisse und Zusammenfassungen geprüft werden, nicht im Originaltext. Data-Dragon-Daten für 26.19 konnten nicht geladen werden. Alle Punkte, die davon abhängen, sind unten als **offen** markiert.

## Kurzfazit

| Frage | Einschätzung |
|---|---|
| Technischer Zugriff auf eigene Live-Daten (Champion, Level, Gold, Werte, Inventar) | **machbar**: dokumentierte lokale Live Client Data API, nur lesend, nur `127.0.0.1:2999` |
| Teamzusammenstellung (Champions, Rollen, Level) | **machbar**: `playerlist`; Rolle (`position`) ist nicht in allen Modi befüllt → manuelle Korrektur vorhanden |
| Gegnerische Käufe live aus der API | **technisch vorhanden, Sichtbarkeit nicht nachgewiesen**: siehe unten. Standard ist deshalb die **manuelle Eingabe**. |
| Exakte Gegnerwerte (Rüstung, MR, Runen, Gold, Buffs) | **nicht verfügbar**: nur Schätzung aus Level und sichtbaren Items, mit Unsicherheitsband |
| Spielversion zur Laufzeit | **nicht in der Live Client Data API**: optional über die inoffizielle LCU (gekapselt, standardmäßig aus) oder manuell |
| Overlay ohne Eingriff ins Spiel | **machbar**: eigenes, klickdurchlässiges Fenster; kein Memory Reading, keine Injection, keine Eingaben. Das Spiel muss im randlosen Fenstermodus laufen. |
| Zulässigkeit des konkreten Live-Anwendungsfalls | **offen, muss vor Veröffentlichung mit Riot geklärt werden** |

## Datenverfügbarkeitsmatrix

„Aktualität“ bezieht sich auf die Abfrage im Standardintervall von 2 s. Die Spalte „Tatsächlich vorhanden“ ist mit einem lokalen Mock geprüft, der dem dokumentierten Schema folgt. Gegen den echten Client wird das Schema zur Laufzeit geprüft und im Steuerfenster unter „Datenverfügbarkeit“ angezeigt. **Gegen einen echten Client ist diese Prüfung noch nicht erfolgt.**

| Benötigtes Feld | Quelle | Tatsächlich vorhanden | Aktualität | Fehlende Details | Fallback |
|---|---|---|---|---|---|
| Eigener Champion | `playerlist[].rawChampionName` (lokalisierungsfrei) | laut Doku ja | je Poll | – | Anzeigename ohne Sonderzeichen |
| Eigene Rolle | `playerlist[].position` | nur in manchen Modi befüllt | je Poll | leer in Custom/ARAM | manuelle Auswahl |
| Eigenes Gold | `activeplayer.currentGold` | ja | je Poll | – | – |
| Eigene Werte (AD, AP, Rüstung, Durchdringung …) | `activeplayer.championStats` | ja | je Poll | Semantik von `armorPenetrationPercent` (verbleibender Anteil) **zu prüfen** | aus Basiswerten + Items abgeleitet (als „abgeleitet“ markiert) |
| Eigene Fähigkeitsränge | `activeplayer.abilities` | ja | je Poll | – | Standard-Skillreihenfolge des Profils |
| Eigenes Inventar | `playerlist[].items` | ja | je Poll | kurzzeitig leere Listen möglich | letzter stabiler Stand (Tracker) |
| Gegner-/Mitspieler-Champions, Level | `playerlist` | ja | je Poll | – | – |
| Gegnerische Items | `playerlist[].items` | technisch ja | unklar (letzter bekannter Stand?) | **Nicht nachgewiesen, dass die Liste nur zeigt, was der Spieler sieht (Tab-Übersicht, Nebel des Krieges)** | **manuelle Eingabe (Standard)**; API nur nach eigener Prüfung per Einstellung |
| Gegnerische Resistenzen/Leben | – | **nein** | – | Runen, Buffs, Stapel, Kit-Passive | Schätzung aus Level + Items mit Band (low/high) |
| Gegnerische Runen | `playerlist[].runes` | nur Keystone + Bäume | je Poll | keine Shards, keine Nebenrunen | Unsicherheitsband |
| Gegnerisches Gold | – | **nein** | – | – | Itemwert sichtbarer Items als schwacher Indikator |
| Kampfschaden-Verläufe | – | **nein** | – | – | nicht genutzt |
| Spielzeit, Modus, Karte | `gamestats` | ja | je Poll | – | – |
| Spielversion | – | **nein** (Live Client Data) | – | – | optional LCU `/lol-patch/v1/game-version` (inoffiziell), sonst manuell; ohne Version sichtbar „eingeschränkt“ |
| Item-Preise, Rezepte, Grundwerte | Data Dragon (`item.json`) | ja | pro Patch | Durchdringung, Lethalität, Fähigkeitstempo und Effekte nur im Tooltip-Text | kuratierte Mechanikdaten (`data/patches/*/items.json`), keine Tooltip-Auswertung |
| Championbasiswerte | Data Dragon (`champion.json`) | ja | pro Patch | – | kuratierte Näherungswerte (markiert) |
| Championmechaniken | – | nein | – | – | versionierte Championprofile (`data/champions/profiles`) |

Speicherung von Herkunft, Zeit und Patch: Jeder Inventarstand trägt eine `Provenance` mit Quelle, Zeitstempel und Spielzeit. Die Engine hält den verwendeten Datensatz mit Patchkennung in `PatchStatus` fest. Eigene Werte sind als `observed` oder `derived` gekennzeichnet, Gegnerwerte als `estimated` mit Band.

## Sichtbarkeit gegnerischer Käufe

Die Live Client Data API liefert für alle Spieler eine Itemliste. Nicht belegt ist, ob diese Liste bei gegnerischen Champions nur den für mich sichtbaren Stand (Tab-Übersicht mit letztem bekanntem Inventar) zeigt oder mehr. Weil das nicht zuverlässig nachgewiesen ist, gilt:

- **Standard:** gegnerische Items werden **manuell** eingetragen (Steuerfenster → „Gegnerische Items“). Die API-Werte werden dort nur als „API meldet (nicht verwendet)“ angezeigt. Nach eigener Kontrolle im Spiel lassen sie sich per Klick übernehmen.
- **Optional:** Einstellung „Live Client Data API (nach eigener Prüfung)“. Sie ist nur vertretbar, wenn die gemeldeten Items nachweislich dem entsprechen, was der Client dir anzeigt, und wenn Riot den Anwendungsfall freigegeben hat.
- **Simulationsmodus:** getrennt, alle Daten als `simulation` gekennzeichnet.

Das Ziel „gegnerische Käufe beeinflussen die Planung“ bleibt dabei vollständig erhalten: Die Engine rechnet mit manuellen und simulierten Inventaren genauso wie mit Live-Inventaren. Es wird nicht stillschweigend auf Standard-Builds ausgewichen.

## Riots Entwicklerregeln (aus Suchergebnissen zusammengefasst, Originaltext nicht abrufbar)

- Produkte dürfen **keine Spielentscheidungen diktieren**. Sie dürfen wichtige Entscheidungen hervorheben und **mehrere Wahlmöglichkeiten** anbieten. Umsetzung: Favorit plus bis zu zwei Alternativen mit Begründung, „Warum nicht …?“, Fixierung eigener Wahl, keine Kaufautomatik.
- Produkte sollen die **Vielfalt** von Builds eher erhöhen als verringern. Umsetzung: Die Engine bewertet den konkreten Zustand statt fester Listen. Zusätzlich zeigt sie, unter welchen Annahmen (Zielfokus, Kampfdauer) andere Items vorne lägen.
- **Benachrichtigungen, die eine Handlung anhand des aktuellen Spielzustands vorschreiben**, sind laut Zusammenfassung untersagt (Beispiel: „Gegner ist unterlevelt, gank top“). Ein dynamisch aktualisierter Kaufvorschlag liegt nahe an dieser Grenze. **Das ist der Hauptgrund, den konkreten Live-Anwendungsfall vor Veröffentlichung mit Riot zu klären.** Mögliche Einschränkungen wären etwa: dynamische Vorschläge nur im Shop oder nach dem Tod, oder nur im Analyse-/Simulationsmodus.
- Keine versteckten Informationen, kein De-Anonymisieren von Spielern, keine Eingriffe ins Spiel. Umsetzung: nur lokale, dokumentierte Schnittstelle, keine Spielerverfolgung, keine Speicherung von Riot-IDs über die Sitzung hinaus.
- **Registrierung:** Produkte müssen im Riot Developer Portal registriert werden. Produktionsschlüssel gehören nicht in ausgelieferte Clients. Die App nutzt derzeit **keinen API-Schlüssel**: Live Client Data und Data Dragon brauchen keinen. Die Registrierung als Produkt ist trotzdem offen.
- Vanguard: Die App liest keinen Prozessspeicher, injiziert nichts und nutzt kein Grafik-Hooking. Das Overlay ist ein normales Fenster, das über dem randlosen Spielfenster liegt. Eine offizielle Bestätigung, dass dieses Vorgehen mit Vanguard unkritisch ist, liegt **nicht** vor.

**Offene Freigaben:**
1. Produktregistrierung im Developer Portal.
2. Klärung des dynamischen Live-Anwendungsfalls, insbesondere der Regel zu zustandsbasierten Handlungsaufforderungen.
3. Klärung, ob gegnerische Itemlisten aus der Live Client Data API genutzt werden dürfen.
4. Prüfung der Regeln im Originaltext; hier wurden nur Suchzusammenfassungen genutzt.

## Quellen

- Riot Games Developer Policies – https://developer.riotgames.com/policies/general (nicht direkt abrufbar, über Suche zusammengefasst)
- Developer Relations: League of Legends – https://support-developer.riotgames.com/hc/en-us/articles/22698698001939
- Developer Relations: General Policies – https://support-developer.riotgames.com/hc/en-us/articles/22698591841939-General-Policies
- Patch 26.19 Notes – https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-19-notes/
- Live Client Data API (Riot Developer Portal, Abschnitt „Game Client API“), Endpunkte `/liveclientdata/allgamedata`, `/playerlist`, `/activeplayer`, `/gamestats`
