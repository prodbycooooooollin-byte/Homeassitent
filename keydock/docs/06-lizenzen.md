# 6. Lizenzlage

Bitte vor einer Veröffentlichung lesen. Diese Zusammenstellung ist eine
technische Recherche, **keine Rechtsberatung**.

## 6.1 Was KeyDock selbst einbringt

Engine, Overlay, Protokoll und Plugin-Code in diesem Repository sind
Eigenentwicklung. Die Engine hat **keine** Drittabhängigkeiten — eigene FFT,
eigener Resampler, eigene Detektoren.

## 6.2 JUCE 8

- Die JUCE-Module sind **dual lizenziert: AGPLv3 oder kommerzielle
  JUCE-Lizenz**.
- Überschreitest du das Umsatzlimit deiner Lizenzstufe (JUCE Personal bzw.
  Indie) und willst weiter verbreiten, gilt für die Verbreitung die **GPLv3** —
  mit der Pflicht, den Quelltext offenzulegen, einschließlich des gelinkten
  Codes.
- Das Umsatzlimit gilt für den **Bruttoumsatz aller** deiner Nutzungen des
  JUCE-Codes, also auch für kostenlose oder „pay what you want"-Plugins.

**Praktisch:** Für ein persönliches Werkzeug unproblematisch. Für ein
verkauftes Closed-Source-Produkt brauchst du eine passende kommerzielle
JUCE-Stufe. Die aktuellen Limits stehen auf der JUCE-Seite — prüfe sie zum
Zeitpunkt der Veröffentlichung neu, sie ändern sich.

## 6.3 VST 3 SDK

Laut SDK-Repository steht das VST 3 SDK inzwischen unter der **MIT-Lizenz**;
die früheren Optionen GPLv3 und proprietäre Steinberg-Lizenz werden dort als
nicht mehr verfügbar bezeichnet. MIT erlaubt sowohl Open-Source- als auch
kommerzielle Verwendung, solange die MIT-Bedingungen eingehalten werden.

Beachte davon unabhängig, dass „VST" eine Marke von Steinberg ist; für die
Nutzung des Logos/Namens gelten deren Markenrichtlinien.

## 6.4 Essentia — bewusst nicht verwendet

Essentia steht unter der **AGPL-3.0**, eine proprietäre Lizenz gibt es nur auf
Anfrage bei der Music Technology Group der Universitat Pompeu Fabra. Die AGPL
ist für ein Closed-Source-Plugin praktisch nicht tragbar. Deshalb enthält
KeyDock **keinen Essentia-Code und keine Essentia-Modelle**. Siehe
`docs/01-machbarkeit.md`, Abschnitt 1.3.

## 6.5 Algorithmen und Profile

Die verwendeten Tonartprofile (**Temperley 2001**, **Krumhansl-Kessler**) sind
in der musikwissenschaftlichen Literatur veröffentlichte Zahlenreihen. Sie
werden hier eigenständig implementiert, nicht aus einer Bibliothek kopiert.
Für eine Veröffentlichung ist eine Nennung der Quellen fair und üblich.

## 6.6 Tunebat

KeyDock nutzt **kein** Scraping und **keine** undokumentierten
Tunebat-Endpunkte. Tunebat diente ausschließlich als funktionale Inspiration.
Laut dessen Analyzer-FAQ gibt es für den Audio-Analyzer keine öffentliche API;
der Analyzer arbeitet mit Essentia.js lokal im Browser.

## Quellen

- [The JUCE 8 End User Licence Agreement](https://juce.com/legal/juce-8-licence/)
- [JUCE — LICENSE.md](https://github.com/juce-framework/JUCE/blob/master/LICENSE.md)
- [Get JUCE (Lizenzstufen)](https://juce.com/get-juce/)
- [VST 3 SDK — Repository (Lizenzangabe)](https://github.com/steinbergmedia/vst3sdk)
- [ESSENTIA: an Open-Source Library for Sound and Music Analysis](http://www.justinsalamon.com/uploads/4/3/9/4/4394963/bogdanov_essentia_acmmm13.pdf)
- [Essentia — Überblick und Lizenz](https://grokipedia.com/page/Essentia_audio_analysis_library)
