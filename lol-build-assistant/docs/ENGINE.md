# Empfehlungsengine

Deterministisch und erklärbar. Gleiche Eingaben liefern gleiche Ausgaben. Kein Sprachmodell entscheidet oder erfindet Werte. Alle Texte werden aus berechneten Größen erzeugt (`src/engine/explain.ts`). Fehlt die Grundlage, entfällt der Satz.

## Schichten

```
data/                 versionierte Daten (Patch-Datensätze, Regeln, Championwissen, Profile, Simulationen)
src/data/             Datenadapter: Live Client Data API, Normalisierung, Inventar-/Goldraten-Stabilisierung, Poller, LCU-Version (optional)
src/sim/              getrennter Simulationsmodus (Szenario + Zeitleiste + manuelle Änderungen)
src/patch/            Laden/Validieren der Patchdaten, Versionsabgleich
src/engine/input.ts   normalisierter, entscheidungsrelevanter Matchzustand (EngineInput)
src/engine/ownStats   eigene Werte (beobachtet oder abgeleitet), Item-Anwendung
src/engine/enemies    Gegnerschätzung (Resistenzen mit Band, Heilung, Schilde), Zielrelevanz, Bedrohung
src/engine/threat     Bedrohungsprofil, Team-Antiheal-Abdeckung
src/engine/damage     Szenario-Schadensmodell
src/engine/evaluator  Offensive / Defensive / Utility eines Builds
src/engine/candidates Kandidaten, Ausschlüsse, Rezeptgraph, Restkosten
src/engine/engine     Pipeline: Bewertung, Einkaufswege, Alternativen, Komponenten, Vorschau, Gegenmaßnahmen-Prüfung
src/engine/advisor    Hysterese, Auslöser, Leave-one-out-Attribution, Änderungsverlauf
src/engine/explain    Texte ausschließlich aus Berechnungsergebnissen
src/present/          View-Model fürs Overlay (reine Funktion)
src/main, renderer    Electron: Poll-Takt, Overlay, Steuerfenster, Hotkeys
```

## Pipeline je Neuberechnung

1. **Datenqualität und Patch prüfen:** Der Datensatz passt zu major.minor, sonst gilt er als *eingeschränkt*; im strikten Modus gibt es keine Empfehlung. Die Engine prüft außerdem Frische (> 10 s gilt als veraltet), unbekannte Items und ein unbekanntes Championprofil. Für nicht unterstützte Champions gibt es **keine generischen Empfehlungen**.
2. **Eigenes Inventar, Komponenten, Gold und freie Plätze** bestimmen. Trinket und Verbrauchsgüter werden ignoriert.
3. **Kandidaten:** kaufbare fertige Items und Stiefel, deren Tags zur gewählten Spielweise passen oder die als Extra im Profil stehen. Die Spielweise wechselt nie automatisch.
4. **Ausschlüsse mit Grund:** bereits besessen, Gruppenbeschränkung (z. B. Last Whisper, Blight, Lifeline, Quicksilver, Hydra), nur Nah- oder Fernkampf, Mana ohne Mana-Ressource, schon Stiefel gekauft, kein freier Platz (dann nur im Verkaufsfall).
5. **Einkaufswege:** Pro Kandidat X werden Restkosten über den Rezeptgraphen berechnet (vorhandene Komponenten werden verbraucht) und daraus die Zeit bis zur Fertigstellung `t_X = (Rest − Gold) / Goldrate`. Dazu kommt ein begrenzter Ausblick auf den besten Folgekauf Y.
   `Wegwert = [V_X·(H − t_X) + max(0, V_{X+Y} − V_X)·(H − t_{XY})] / H` mit `H = max(Einstellung, (6000 − Gold)/Goldrate + 60)`.
   Damit werden „fast fertiges Kernitem“ und „Umweg über eine Gegenmaßnahme“ direkt vergleichbar.
6. **Zusatznutzen gegenüber dem aktuellen Inventar:** verbrauchte Komponenten werden abgezogen, das Item hinzugefügt.
7. **Kombinierte Bewertung** (siehe unten), Konfidenz, Treiberanalyse.
8. **Alternativen:** zwei nahe Optionen mit berechnetem Vorteil (mehr Schaden, mehr Sicherheit, früher fertig). Für jede wird angegeben, unter welchen Annahmen sie vorne läge.

## Kriterien und Normalisierung

Es gibt keine Summe unvereinbarer Rohwerte. Jedes Kriterium ist dimensionslos:

| Kriterium | Definition |
|---|---|
| Offensive | relativer Zuwachs von `Σ_Ziele w_t · Σ_Szenarien w_s · Schaden/effektive-LP(Ziel)` |
| Defensive | relativer Zuwachs der effektiven LP gegen die bedrohungsgewichtete Schadensmischung |
| Utility | absolute Punkte (klein, gedeckelt): Verlangsamung, Teamschaden-Unterstützung, Mana-Deckung, Tempo für Utility-Spielweisen |

`Wert = w_off·Offensive + w_def·Defensive + w_util·Utility`. Die Grundgewichte stehen je Spielweise im Championprofil. `w_def` wird mit dem Bedrohungsindex (0,6–1,8) multipliziert, danach werden die Gewichte normiert. Die aktuellen Gewichte erscheinen in der UI unter „Annahmen“.

**Konfidenz** = Patch-Faktor (geprüft 1 / ungeprüft 0,85 / Versionsabweichung 0,75) × Item-Modellabdeckung (voll 1 / teilweise 0,85 / nur Werte 0,7) × Gegnerdatenqualität (0,6–1) × Championabdeckung (1 / 0,85).
`angepasster Wert = Wert · (0,85 + 0,15·Konfidenz)`. Das ist nur ein milder Tie-Breaker zugunsten gut modellierter Optionen.

Ein interner Score ist **keine Gewinnwahrscheinlichkeit**.

## Schadensmodell (`damage.ts`)

Je Szenario des Championprofils (Dauer, Auto-Uptime, Einsätze je Fähigkeit oder „nach Abklingzeit“, angenommenes fehlendes Leben):

- **Autoattacken:** `AS · Dauer · Uptime`. Angriffstempo gedeckelt bei 2,5. Kampf-Buffs wie die Jinx-Minigun zählen mit Uptime-Annahme.
- **Krit:** Erwartungswert `1 + Krit·(Kritschaden − 1)`, reduziert durch gegnerischen Randuin.
- **On-Hit:** % aktuelles Leben (BotRK), flach und AP-skaliert (Wit's End, Nashor), jeder n-te Treffer (Kraken, mit Fernkampf-Faktor), Spellblade (Sheen-Familie).
- **Fähigkeiten:** Grundschaden je Rang bzw. je Level, AD-, Bonus-AD-, AP- und Rüstungsratios, % max./fehlendes Leben, Treffer pro Einsatz, Zed-R-Markierung.
- **Resistenzen** (`combat.ts`, Regeln in `data/rules/combat-rules.json`): zuerst flache Reduktion, dann prozentuale Reduktion, dann prozentuale Durchdringung (mehrere Quellen multiplikativ), dann flache Durchdringung bzw. Lethalität (flach, nicht levelskaliert, **zu prüfen**). Durchdringung senkt nie unter 0.
- **Rüstungsreduktion über Zeit:** Black Cleaver und Terminus mit durchschnittlichen Stapeln über die Trefferzahl.
- **Effektive Ziel-LP** = LP · (1 − Hinrichtung) + Schild · (1 − Schildbrecher) + Heilung im Fenster · (1 − 0,4 · Antiheal-Abdeckung). Die Antiheal-Abdeckung kombiniert eigenes und Team-Antiheal: `1 − (1−eigen)(1−Team)`.
- **Overkill:** Bei kurzen Combos (≤ 4 s) ist der Anteil bei 1,25 gedeckelt. Bei längeren Kämpfen ist er ungedeckelt, weil Schaden auf weitere Ziele übergeht.

## Gegner (`enemies.ts`)

- **Werte:** Basiswerte nach Level (Riot-Wachstumsformel) plus sichtbare Items. Das Band (low/high) berücksichtigt Runen, Stapel-Items (Jak'Sho, Force of Nature) und Kit-Passive laut Championwissen. Unbekannte Items werden gemeldet und **nicht** bewertet.
- **Heilung:** Kit-Stufe (0–3) × max. LP pro Sekunde plus Lebensraub aus Items. Heilverstärkung (Spirit Visage) wird eingerechnet.
- **Zielrelevanz:** Erreichbarkeit laut Profil (Front-/Backline-Zugriff) × Fokus-Einstellung × Carry-Priorität × Vorsprung. Die Werte werden über alle Gegner normiert. Die Fokus-Einstellung ist eine **Annahme**, keine Positionsinformation.
- **Bedrohung** (davon getrennt): Klassenschaden × Offensivitems relativ zum erwarteten Stand zur Spielzeit × Reichweite zu mir (Dive vs. Backline) × Level/Kills (Kills nur schwach gewichtet). Defensivitems erhöhen die Bedrohung nicht.
- **Team-Antiheal:** Zuverlässigkeit je Mitspieler nach Klasse, Reichweite zum Ziel und Anwendungsart. „Getroffen werden“ wie bei Thornmail zählt nur gegen Autoattacker.

## Defensive (`evaluator.ts`)

`EHP = (LP + Lifeline-Schilde) / Σ(Anteil_Typ · Resistenzmultiplikator)`. Dabei wird gegnerische Durchdringung aus sichtbaren Items gewichtet eingerechnet, Autoattack-Reduktion (Steelcaps) und Kritreduktion (Randuin) wirken auf den Autoattack-Anteil.

**Heuristiken** (dokumentiert, in der UI als Heuristik gekennzeichnet, fachlich zu kalibrieren):

| Effekt | Aufschlag auf EHP |
|---|---|
| Stasis | × (1 + 0,3 · Burst-Anteil) |
| Wiederbelebung | × 1,2 |
| Zauberschild | × (1 + 0,06 + 0,1 · reinigbare harte CC) |
| Reinigung | × (1 + 0,3 · reinigbare harte CC · (0,5 + 0,5 · Burst)) |
| Zähigkeit | × (1 + 0,6 · Zähigkeit · CC-Anteil, auf den Zähigkeit wirkt) |
| Schadensverzögerung | × (1 + Wert/0,3 · 0,25 · Burst) |
| Lifeline-Schild (Backliner) | Schild × (1 + 0,6 · Burst) |

CC-Regeln (was reinigbar ist, worauf Zähigkeit wirkt) stehen in `combat-rules.json`.

## Hysterese und Änderungen (`advisor.ts`)

- **Getrennte Takte:** Der Poll kommt alle 2 s. Neu gerechnet wird nur bei einer Beobachtung, einer Goldänderung ≥ 100 g oder einem laufenden Herausforderer. Der Favorit wechselt **nur**, wenn eine Beobachtung vorliegt: Gegner- oder Mitspielerkauf bzw. -verkauf, eigener Kauf, Gegnerlevel +2, eigene Levelschwellen 6/11/16 oder +2, geänderte Einstellung.
- **Budgetänderungen** aktualisieren nur die Komponenten, nicht den Favoriten.
- **Wechsel**, wenn der neue Wegwert ≥ Favorit · (1 + 6 %) ist und an 2 aufeinanderfolgenden Auswertungen stabil bleibt. Ab 20 % Vorsprung wird sofort gewechselt. Ist der Favorit gekauft oder nicht mehr kaufbar, wird ebenfalls sofort gewechselt. Bei veralteten Daten gibt es keinen Wechsel.
- **Attribution (Leave-one-out):** Jede Beobachtung seit der Wahl des Favoriten wird im Input zurückgenommen und neu gerechnet. Ausgewiesen wird, welche einzeln den Wechsel kippt, welche den Vergleich verschiebt (in Prozentpunkten) und ob nur die Gesamtheit kippt.
- **Verlauf:** Pro Ereignis werden Zeit, alter und neuer Vorschlag, Beobachtungen, ausschlaggebende Beobachtungen und der Trade-off gespeichert. Protokolliert werden auch „Plan beibehalten“-Einträge, wenn ein Herausforderer aufholt, aber unter der Schwelle bleibt.

## Kalibrierung

Die Gewichte, Heuristiken und Szenario-Annahmen wurden an den Szenarien in `test/scenarios.test.ts` ausgerichtet. Die Tests prüfen fachliche Richtungen, Rangfolgen, Ausschlüsse und Stabilität, nicht die Formeln selbst. Eine **fachliche Validierung durch erfahrene Spieler steht aus** (siehe `STATUS.md`). Bekannte Kalibrierungsentscheidungen:

- Bedrohungsindex: Referenz ist ein typischer Carry (Klassenschaden 0,9, erwarteter Itemstand bei ~4,5 g/s in Offensive, Reichweite 0,65). Die größte Einzelbedrohung zählt mit 65 %, die zweitgrößte mit 35 %.
- Wechselschwelle 6 % und Sofortschwelle 20 % sind Startwerte und im Steuerfenster einstellbar.
- Werte der kuratierten Items stammen aus dem Wissensstand zu Patch 25.x und sind für 26.19 nicht geprüft.
