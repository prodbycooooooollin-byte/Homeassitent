# Bewertungslogik (Arbeitsmodell)

Die Bewertung läuft lokal und deterministisch, ohne Sprachmodell und ohne Abo. Alle Gewichte stehen in `src/engine/weights.ts`. Das Modell ist eine nachvollziehbare Heuristik und **keine validierte Gewinnwahrscheinlichkeit**. Es zeigt keine Angaben wie „x % Siegchance“.

## Schichten

```
Provider (demo | manual | spectator) → ProviderSnapshot
  → MatchStore (validiert, Beobachtungsstatus, Ereignisse)
  → assess.ts  (eigener Kontext, Bedrohung je Gegner, Bedarfsvektor)
  → score.ts   (Grenznutzen je Item, gemeinsam für Kaufen/Sparen/Austausch)
  → advisor.ts (Preis, Slots, Jetzt kaufen / Sparen, Austausch, Stabilisierung)
  → explain.ts (Begründungen aus denselben Faktoren)
  → alerts.ts  (Hinweise bei gegnerischen Käufen)
  → viewModel  (nur Aufbereitung)
```

## Spieldaten → Effekte

**Automatisch aus eindeutigen Eigenschaften**, jeweils normalisiert auf eine Referenzgröße (Stärke 1,0):

| Eigenschaft | Effekt | Referenz |
|---|---|---|
| `BulletResist` | Bullet-Resistenz | 30 % |
| `TechResist` | Spirit-Resistenz | 30 % |
| `BonusHealth` | Leben | 300 |
| Waffen-/Spirit-Werte | Schadenswerte | – |
| Lebensraub, Regeneration, Heilverstärkung | Heilung | – |
| `StatusResistancePercent` | Statusresistenz | – |
| negative Resistenzwerte | Resistenz-Abbau („Shred“) | – |

- Aktive Items werden über ihre Abklingzeit abgeschwächt.
- Umschaltbare Items zählen mit Faktor 0,6, weil sie Leben kosten.

**Kuratierte Spezialeffekte** stehen in `data/knowledge/effects.json`. Dazu gehören Heilungsreduktion mit Übertragungsweg, Cleanse, Immunität, Kugelimmunität, Todesschutz, Stille und Entwaffnung. Jeder Eintrag verweist auf eine Eigenschaft oder ein Muster im offiziellen Beschreibungstext.

- Passt der Eintrag nicht mehr zum aktuellen Build, gilt die Mechanik als „unbestätigt“. Der Kandidat erhält dann den Faktor 0,5 und einen Hinweis.
- Beispiel Unstoppable: laut Text „Cannot be used while Stunned“, also `usableWhileStunned: false`.
- Beispiel Indomitable: löst automatisch aus.

**Hero-Signale** werden aus den Signaturfähigkeiten abgeleitet, über Eigenschaften und Beschreibung. Dazu gehören harte Kontrolle (Stun, Schlaf, Immobilisierung, Stille, Anheben, …) und Heilung. Skalierung und Schadensmischung stammen aus einer **kuratierten Einschätzung** (`hero-profiles.json`). Der Sicherheitsgrad ist je Hero angegeben.

## Bedrohung je Gegner (0–1)

```
power      = 0.6·Wirtschaft(net worth relativ zum Schnitt) + 0.4·Build-Stärke(Stufen der Items)
raw        = 0.55·power + 0.10·Beteiligung(K+A/Teamkills) + 0.35·Schadensanteil gegen mich (falls gemessen, sonst 0.7·power) + 0.25·gemeldet
enabler    = CC-Stärke/1.5 · max(0, stärkster Mitspieler − 0.45) · 1.8
threat     = clamp(raw + 0.35·enabler·(1 − 0.5·power), 0.05, 1)
```

- Viel Farm bei wenigen Kills wird über `power` erkannt.
- Ein schwacher Gegner mit Kontrolle bleibt über `enabler` und die Untergrenze relevant.
- Die Schadensmischung (Waffe/Spirit/Nahkampf) kommt aus dem Profil, gemischt mit der beobachteten Item-Investition (im UI „aus Build geschätzt“). Nur mit Schadensfenster wird sie durch Messung ersetzt („aus Schadensfenster erkannt“).

## Bedarf (0–1, gesättigt: 1 − e^(−x))

Die Schutzbedarfe gegen Waffen-, Spirit- und Nahkampfschaden ergeben sich aus der Bedrohung mal dem Anteil der jeweiligen Schadensart.

Beim **CC-Schutz** hat fast jeder Hero etwas Kontrolle. Deshalb zählt die relevanteste Quelle voll, alle weiteren abnehmend (1, 1/2, 1/3, …). Ein „CC-Problem“, das du meldest, erhöht den Bedarf und setzt ihn in den Fokus (Faktor 1,35).

Die **Heilungsreduktion** ergibt sich aus Bedrohung mal Heilung (Fähigkeiten und Heil-Items).

## Item-Nutzen (gemeinsame Grundlage)

```
Nutzen = Σ_Bedarf  Bedarf · [f(Abdeckung mit Item) − f(Abdeckung ohne)] · Fokus
       + 0.62·0.9 · Offensivwert(Skalierung · Schaden, Shred × Gegner-Resistenz, Prozentschaden × Zähigkeit, …)
       − Spielphase (zu niedrige Stufe)
       − verbrauchte Komponente (Upgrade: nur der Zugewinn zählt) + 0.08 Kontinuität
       × 0.5, falls Mechanik unbestätigt
Score  = Nutzen · clamp((Stufenpreis der Phase / Preis)^0.35, 0.65, 1.3)
```

- `f(x) = 1 − e^(−1.2x)` bildet den abnehmenden Grenznutzen ab. Bereits vorhandener Schutz senkt so automatisch den Zusatznutzen.
- Nicht stapelnde Effekte (z. B. Heilungsreduktion) zählen nur einmal.
- Die **Anwendbarkeit** wird geprüft:
  - Heilungsreduktion über Kugeln nützt einem Spirit-Hero wenig.
  - Aktiver Cleanse und Immunität verlieren gegen Stun-Gegner an Wert.
  - Eigene Heilung verliert an Wert, wenn der Gegner Heilungsreduktion hat.

## Jetzt kaufen / darauf sparen

- **A** = bester Kauf, der bezahlbar ist und einen Slot hat.
- **B** = bestes Ziel in Reichweite: Budget plus 3.200 Souls oder 3 Minuten Einnahmen.

Die Zwischenlösung A lohnt sich in diesen Fällen:

- A ist eine Komponente von B.
- A erreicht mindestens 80 % von B.
- B ist noch mindestens 2.400 Souls entfernt und A erreicht mindestens 60 %.
- Der Unterschied ist klein.

Dazu gelten Ausnahmen:

- Bei bekannter Einnahmerate darf A das Ziel höchstens um 75 s verzögern.
- Nach jedem bereits gekauften Zwischenkauf für dasselbe Ziel steigt die Schwelle um 10 Prozentpunkte. Sonst würde eine Kette von Zwischenkäufen das Ziel immer weiter hinausschieben.
- Ein niedrigstufiges Item, das einen der letzten zwei Slots belegt, braucht eine um 10 Punkte höhere Schwelle.

Ist das **Budget unbekannt**, wird kein Kauf als bezahlbar markiert.

## Austausch

Der Austausch wird geprüft, wenn die Hauptempfehlung keinen Slot hat, bei aktiven Items auch keinen Aktiv-Slot. Für jedes besessene Item gilt:

```
Behalten   = Grenznutzen im aktuellen Match (ohne sich selbst) + 0.15, falls Komponente eines geplanten Upgrades
Tausch     = Nutzen(neues Item | ohne altes Item) − Behalten
Netto      = Preis − ⌊Listenpreis(altes Item) · 0.5⌋
```

Ein Vorschlag erscheint nur ab einem Zugewinn von 0,08. Sonst erscheint die Begründung, warum kein Austausch sinnvoll ist.

## Stabilisierung

Eine sichtbare Empfehlung bleibt 8 s stehen, solange eine neue nicht klar besser ist. Klar besser heißt: mehr als max(0,05; 12 %).

Sofort ersetzt wird sie, wenn sie gekauft wurde, ungültig ist oder nicht mehr bezahlbar ist.

## Hinweise

Relevanz eines Hinweises:

```
Relevanz = (0.4 + 0.6·Bedrohung des Käufers) · Σ Zunahme des Bedarfs (+ 0.6·Zunahme der gegnerischen Verteidigung)
```

Die Zunahme wird berechnet, indem die Lage einmal mit und einmal ohne die neuen Items bewertet wird.

- Käufe werden 5 s gebündelt.
- Doppelte Meldungen werden unterdrückt.
- Nach einem Hinweis gilt eine Abkühlzeit von 12 s.
- Es gibt keine Meldungen für die Basislinie.
- Bei der Spectator-Quelle heißt es „neu erkannt“, weil keine Kaufzeitpunkte vorliegen.
