# Ehrlicher Stand

## Funktioniert (automatisiert getestet: 51 Tests, `npm test`)

- Electron-App mit klickdurchlässigem, verschiebbarem, skalierbarem und per Hotkey ausblendbarem Overlay sowie einem Steuerfenster. Im Simulationsmodus unter Linux/Xvfb per Screenshot geprüft. **Unter Windows mit laufendem Spiel noch nicht getestet.**
- Live-Datenadapter für die Live Client Data API mit gezielten Endpunkten (`activeplayer`, `playerlist`, `gamestats`). Getestet gegen einen lokalen HTTP-Mock nach dokumentiertem Schema, **nicht gegen einen echten Client**. Dazu gehören Schema-Prüfung zur Laufzeit, Messwerte (Abfragezeit, Bytes), Wiederverbinden sowie die Status „wartet“, „live“, „veraltet“ (mit Alter) und „beendet“.
- Inventar-Stabilisierung: Leere Listen gelten nicht als Verkauf. Upgrades werden erkannt. Verkäufe zählen erst nach 8 s Bestätigung. Die Goldrate wird ohne Kaufsprünge berechnet.
- Getrennter Simulationsmodus mit Szenarien und Zeitleiste (`data/sim`) sowie manuellen Gegnerkäufen und -verkäufen im Steuerfenster. Die CLI-Demo läuft mit `npm run demo`.
- Deterministische Engine: Kandidaten, begründete Ausschlüsse, Rezeptgraph und Restkosten, Komponenten im Budget, „Gold sparen“ mit Begründung, Einkaufswege mit Folgekauf, Alternativen mit berechnetem Vorteil, „Warum nicht …?“, Annahme-Varianten (Zielfokus, Kampfdauer, kurzer Horizont), Robustheit über das Schätzband, Fixieren eines Items, vorläufige Antiheal-Komponente und Verkauf als markierte Ausnahme.
- Hysterese, Auslöser, Leave-one-out-Attribution und Änderungsverlauf inklusive „Plan beibehalten“.
- Patchdaten sind versioniert. Bei Versionsabweichung oder unbekannter Version wird sichtbar eingeschränkt, auf Wunsch auch strikt blockiert. Unbekannte Items werden gemeldet und nicht bewertet.
- Das Patch-Sync-Skript erzeugt einen Datensatz aus Data Dragon mit Abweichungsbericht. Die Merge-Logik ist mit einem Fixture getestet. **Gegen das echte Data Dragon lief es noch nicht**, weil der Host in der Entwicklungsumgebung gesperrt war.

## Nur modelliert (Näherungen, Annahmen, Heuristiken)

- Alle Item- und Championzahlen im kuratierten Datensatz stammen aus dem **Wissensstand zu Patch 25.x**. Preise, Werte und Effekte können für 26.19 abweichen, und neuere Items fehlen, etwa Stufe-3-Stiefel.
- Gegnerische Resistenzen und Leben sind Schätzungen: Level plus sichtbare Items, dazu ein Band für Runen, Stapel und Passive.
- Die Szenarien (Dauer, Uptime, Einsätze, fehlendes Leben, Minigun-Uptime) sind Annahmen je Championprofil.
- Die defensiven Sondereffekte (Stasis, GA, QSS, Zauberschild, Zähigkeit, Schadensverzögerung) sind Heuristiken, siehe `ENGINE.md`.
- Zielrelevanz ist eine Annahme über Erreichbarkeit plus Fokus-Einstellung und beruht nicht auf Positionsdaten.
- Das Championwissen für ~83 Champions ist grob: Klasse, Schadensmischung, Heilung, Schilde, CC. Die Basiswerte sind Näherungen, bis ein Data-Dragon-Sync gelaufen ist.
- Unterstützte Champions:
  - **Jinx** (Krit-Marksman), **Zed** (Lethalitäts-Assassine), **Syndra** (Burst-Magierin) und **Malphite** (Tank bzw. AP-Burst als zwei Spielweisen): unterstützt.
  - **Darius** (Juggernaut): nur teilweise modelliert, z. B. ohne Noxische Macht und Q-Heilung, und in der UI so gekennzeichnet.
  - Alle anderen Champions: **nicht unterstützt**. Es wird bewusst nichts Generisches empfohlen.

## Noch nicht implementiert

- Optionale Championauswahl-Integration über die LCU. Nur die Versionsabfrage ist gekapselt vorbereitet.
- Stufe-3-Stiefel, Support-Questitems, Verbrauchsgüter und Elixiere als Kandidaten.
- Mehrziel-Schaden (Flächenschaden, Runaan's, Hydra) jenseits einer groben Utility-Pauschale.
- Positionsabhängige Reichweiten- und Kiting-Modelle, Beschwörerzauber, Drachen- und Baron-Buffs.
- Empirische Build-Statistiken zur Plausibilitätsprüfung. Es ist bewusst keine Datenquelle angebunden.
- Optionale LLM-Umformulierung der berechneten Gründe. Nicht nötig, Texte sind deterministisch.
- Windows-Installer ist konfiguriert (`npm run dist:win`), aber nicht gebaut oder signiert.
- Riot-Produktregistrierung und Freigabe des Live-Anwendungsfalls (siehe `FEASIBILITY.md`).

## Fachlich nicht validiert

Funktionierende Softwaretests beweisen keine guten Builds. Vor einer Veröffentlichung sollten erfahrene Spieler bzw. Theorycrafter prüfen:

1. `jinx-armor-stack`: Ist Lord Dominik's gegen die gezeigten Rüstungswerte die richtige Richtung? Ist der Abstand zu Kraken und Terminus plausibel?
2. `syndra-armor-stack`: Bleibt Syndra korrekt bei Shadowflame, solange nur Rüstung gekauft wird? Ist der Wechsel zu Void Staff nach vier MR-Käufen zu früh, zu spät oder richtig?
3. `zed-threat`: Serpent's Fang vs. Edge of Night gegen eine vorne liegende Syndra. Ist die Zurückhaltung richtig?
4. Test „Gegnerische Heilung, eigenes Team besitzt Antiheal“: Sind die Zuverlässigkeitsannahmen für Team-Antiheal sinnvoll?
5. Die Heuristik-Tabelle in `ENGINE.md` (Stasis, GA, QSS …).
6. Alle Item- und Championzahlen nach einem Data-Dragon-Sync für den laufenden Patch.

Bis diese Prüfung erfolgt ist, gilt der Status **„fachliche Validierung offen“**. Das steht in jedem Datensatz (`reviewStatus`) und in jedem Championprofil.
