# Leistungsmessung

Gemessen mit `npm run perf` (`tools/perf/measure.mjs`) am 01.10.2026 mit dem
eingebauten Demo-Projekt „Haus am Lindenweg“ (2 Etagen, 11 Räume,
22 Öffnungen, 63 Objekte, 36 Gerätezuordnungen, Erdgeschoss mit geschnittenen
Wänden sichtbar).

**Umgebung:** Linux-Container, 4 vCPU Intel Xeon 2,8 GHz, **keine GPU** –
Chromium 141.0.7390.37 (Playwright-Build 1194) mit **SwiftShader-Softwarerendering**.
Die Bildraten unten sind deshalb ausschließlich Software-Rendering-Werte und
**nicht** auf Desktop-Grafik oder Tablets mit GPU übertragbar. Auf echter
Hardware wurde nicht gemessen; es wird keine Bildrate zugesagt.

| Profil | Laden bis 3D sichtbar | Netze | Zeichenaufrufe/Bild | Dreiecke | Bilder in 3 s Stillstand | Bildzeit beim Drehen (Median / 95 %) |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop 1366×860, „Ausgewogen“ | 1,8 s | 285 | 461 | 7 484 | 1 | 250 ms / 317 ms |
| Desktop 1366×860, „Hoch“ | 0,6 s¹ | 285 | 461 | 7 484 | 0 | 283 ms / 350 ms |
| Tablet-Profil 1280×800, CPU 4× gedrosselt, „Sparsam“ | 1,2 s | 285 | 461 | 7 484 | 1 | 133 ms / 217 ms |
| Tablet-Profil 1280×800, CPU 4× gedrosselt, „Ausgewogen“ | 1,3 s | 285 | 461 | 7 484 | 1 | 250 ms / 533 ms |

¹ Zweiter Aufruf, Dateien bereits im Browser-Cache.

## Beobachtungen

- **Stillstand:** Die Szene zeichnet nur bei Bedarf (`frameloop="demand"`).
  Ohne Interaktion wurden in 3 s 0–1 Bilder gezeichnet (das eine stammt aus
  einer Live-Wert-Aktualisierung der Demo).
- **Grafikstufe „Sparsam“** (keine Schatten, keine Texturen, kein
  Kantenglätten, keine Punktlichter, Pixelverhältnis 1) halbiert im
  Softwarerendering die Bildzeit gegenüber „Ausgewogen“.
- Die Zahl der Zeichenaufrufe (461) ist der wichtigste Ansatzpunkt: Möbel
  bestehen aus mehreren Grundkörpern, Wände aus einzelnen Quadern. Geplante
  Optimierung: Instanzierung bzw. Zusammenfassen statischer Geometrie je
  Etage. Eine erste Maßnahme (einfaches statt sechsfaches Material für
  ungeschnittene Wände) senkte die Aufrufe von 496 auf 461.

## Wiederholen

```bash
npm run build && npm start &
npm run perf -- http://127.0.0.1:8787/
```
Auf einem echten Wandtablet: Seite öffnen, Grafikstufe in den Einstellungen
wählen; `window.__lh.renderInfo()` liefert in der Browserkonsole die aktuellen
Zeichenaufrufe.
