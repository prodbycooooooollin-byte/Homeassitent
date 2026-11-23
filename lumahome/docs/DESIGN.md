# Gestaltung

Ruhiges, helles Erscheinungsbild eines hochwertigen Wohnungsplaners.

| Rolle | Farbe | Hinweis |
| --- | --- | --- |
| Hintergrund | `#F5F3EE` | warmes Off-White |
| Hauptflächen | `#FFFFFF` | Karten, Panels |
| Sekundärflächen | `#ECEEE8` | Segmente, Infoflächen |
| Haupttext | `#242A28` | Graphit |
| Sekundärtext | `#6F7773` | auf Weiß/Hintergrund |
| Sekundärtext auf Sekundärfläche | `#59615D` | abgedunkelt, weil `#6F7773` auf `#ECEEE8` nur 3,9 : 1 erreicht |
| Primärakzent | `#4D7163` | Salbeigrün (weiße Schrift 5,4 : 1) |
| Auswahl | `#E0EBE4` | |
| Energie | `#7866B2` | Violett, nur für Energie |
| Warnung / Fehler | `#8A5A00` auf `#FBF0D9` / `#A63A2F` auf `#F8E3DF` | nur für echte Hinweise |

Alle Text-Kombinationen werden in `tests/contrast.test.ts` auf mindestens
4,5 : 1 geprüft. Bedienflächen sind mindestens 44 px hoch, nichts hängt von
Hover ab, Animationen respektieren „reduzierte Bewegung“.

3D: plastisches Architekturmodell mit geschnittenen Wänden (dunkle
Schnittkanten), natürlichen Bodenmaterialien (prozedurale Texturen),
Tageslicht mit weichen Schatten. Eingeschaltete Lampen leuchten, werfen
Punktlicht mit begrenzter Reichweite und tönen den Boden ihres Raums warm –
die Tönung bleibt im Raumpolygon und scheint nicht durch Wände. Zusätzlich
zeigt ein Symbol über jeder eingeschalteten Leuchte den Zustand auch bei
heller Tagesansicht.
