# Einstellungskatalog (Version 2026.09.30-1)

Automatisch erzeugt aus `src/core/catalog.ts` (`npx tsx scripts/gen-settings-doc.ts`).

Status: **bestätigt** = Schlüssel, Wirkung und Schreibweg in einem genannten Build geprüft · **noch ungeprüft** = Schlüssel belegt, Wirkung nicht im Spiel geprüft · **veraltet** · **nicht unterstützt**.

Derzeit ist **keine** Einstellung „bestätigt“: In der Entwicklungsumgebung war kein Deadlock-Build verfügbar. Siehe docs/VERIFY.md für das Prüfverfahren.

| Kategorie | Einstellung | Datei | Schlüssel | Typ / Bereich | portabel | Status | Anwendung | Belege |
|---|---|---|---|---|---|---|---|---|
| Anzeige | Vollbild | video.txt | `setting.fullscreen` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Randloses Fenster | video.txt | `setting.nowindowborder` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Auflösung – Breite | video.txt | `setting.defaultres` | int -1–16384 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Auflösung – Höhe | video.txt | `setting.defaultresheight` | int -1–16384 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Bildwiederholrate (Zähler) | video.txt | `setting.refreshrate_numerator` | int 0–1000000 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Bildwiederholrate (Nenner) | video.txt | `setting.refreshrate_denominator` | int 0–1000000 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Monitor | video.txt | `setting.monitor_index` | int 0–16 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Seitenverhältnis-Modus | video.txt | `setting.aspectratiomode` | int 0–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | High-DPI | video.txt | `setting.high_dpi` | bool01 0/1 | nein | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Minimieren bei Fokusverlust | video.txt | `setting.fullscreen_min_on_focus_loss` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | V-Sync | video.txt | `setting.mat_vsync` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | FPS-Limit | video.txt | `setting.fps_max` | int 0–1000 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Anzeige | Low Latency (NVIDIA Reflex) | video.txt | `setting.r_low_latency` | int 0/1/2 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot, skipeo-autoexec |
| Anzeige | Helligkeit (Gamma) | video.txt | `setting.r_fullscreen_gamma` | float 1–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Sichtbarkeit | Blitzeffekte reduzieren | video.txt | `setting.r_reduce_flash` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Sichtbarkeit | Lichtempfindlichkeitsmodus | video.txt | `setting.r_light_sensitivity_mode` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Sichtbarkeit | Umrisse | video.txt | `setting.r_citadel_outlines` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Renderauflösung (Skalierung) | video.txt | `setting.mat_viewportscale` | float 0.25–1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Upscaling-Verfahren | video.txt | `setting.r_citadel_upscaling` | int 0–4 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | DLSS-Modus | video.txt | `setting.r_citadel_dlss_settings_mode` | int 0–5 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | FSR-Schärfe | video.txt | `setting.r_citadel_fsr_rcas_sharpness` | float 0–2 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Kantenglättung | video.txt | `setting.r_citadel_antialiasing` | int 0–4 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Detailstufe (cpu_level) | video.txt | `setting.cpu_level` | int 0/1/2/3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Detailstufe (gpu_level) | video.txt | `setting.gpu_level` | int 0/1/2/3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Texturstufe (gpu_mem_level) | video.txt | `setting.gpu_mem_level` | int 0/1/2/3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Speicherstufe (mem_level) | video.txt | `setting.mem_level` | int 0/1/2/3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Shaderqualität | video.txt | `setting.shaderquality` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Schatten | video.txt | `setting.r_shadows` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Schattenqualität | video.txt | `setting.r_citadel_shadow_quality` | int 0–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Umgebungsverdeckung (SSAO) | video.txt | `setting.r_citadel_ssao` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | SSAO-Qualität | video.txt | `setting.r_citadel_ssao_quality` | int 0–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Nebelqualität | video.txt | `setting.r_citadel_fog_quality` | int 0–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Partikeldetails | video.txt | `setting.r_particle_max_detail_level` | int 0–3 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Partikelschatten | video.txt | `setting.r_particle_shadows` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Bloom (Effekte) | video.txt | `setting.r_effects_bloom` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Bloom (Nachbearbeitung) | video.txt | `setting.r_post_bloom` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Tiefenschärfe | video.txt | `setting.r_depth_of_field` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Bewegungsunschärfe | video.txt | `setting.r_citadel_motion_blur` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Distanzfeld-Schatten | video.txt | `setting.r_citadel_distancefield_shadows` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Distanzfeld-Reflexionen | video.txt | `setting.r_citadel_distancefield_reflections` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Grafik | Rauschige Effekte in halber Auflösung | video.txt | `setting.r_citadel_half_res_noisy_effects` | boolword false/true | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Erweitert | Textur-Mip-Bias | video.txt | `setting.r_texture_stream_mip_bias` | int 0–8 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot, optilock-gameinfo |
| Erweitert | Bekanntes Gerät | video.txt | `setting.knowndevice` | bool01  | nein | noch ungeprüft | nur Entwurf – wird nicht angewendet | optilock-videotxt-screenshot |
| Erweitert | Empfohlene Höhe | video.txt | `setting.recommendedheight` | int  | nein | noch ungeprüft | nur Entwurf – wird nicht angewendet | optilock-videotxt-screenshot |
| Erweitert | Erweiterte Einstellungen genutzt | video.txt | `setting.useadvanced` | bool01 0/1 | ja | noch ungeprüft | nur wenn der lokale Build den Schlüssel angelegt hat | optilock-videotxt-screenshot |
| Crosshair | Farbe Rot | autoexec.cfg | `citadel_crosshair_color_r` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Farbe Grün | autoexec.cfg | `citadel_crosshair_color_g` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Farbe Blau | autoexec.cfg | `citadel_crosshair_color_b` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Abstand | autoexec.cfg | `citadel_crosshair_pip_gap` | float -10–50 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Statischer Abstand | autoexec.cfg | `citadel_crosshair_pip_gap_static` | boolword false/true | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Länge | autoexec.cfg | `citadel_crosshair_pip_height` | float 0–60 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Breite | autoexec.cfg | `citadel_crosshair_pip_width` | float 0–20 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Deckkraft | autoexec.cfg | `citadel_crosshair_pip_opacity` | float 0–1 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Kontur | autoexec.cfg | `citadel_crosshair_pip_outline_border` | float 0–6 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Kontur-Abstand | autoexec.cfg | `citadel_crosshair_pip_outline_gap` | float 0–6 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Linien-Kontur-Deckkraft | autoexec.cfg | `citadel_crosshair_pip_outline_opacity` | float 0–1 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Punkt-Größe | autoexec.cfg | `citadel_crosshair_dot_size` | float 0–30 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Punkt-Deckkraft | autoexec.cfg | `citadel_crosshair_dot_opacity` | float 0–1 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Punkt-Kontur | autoexec.cfg | `citadel_crosshair_dot_outline_border` | float 0–6 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Punkt-Kontur-Abstand | autoexec.cfg | `citadel_crosshair_dot_outline_gap` | float 0–6 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Punkt-Kontur-Deckkraft | autoexec.cfg | `citadel_crosshair_dot_outline_opacity` | float 0–1 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Konturfarbe Rot | autoexec.cfg | `citadel_crosshair_outline_color_r` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Konturfarbe Grün | autoexec.cfg | `citadel_crosshair_outline_color_g` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Konturfarbe Blau | autoexec.cfg | `citadel_crosshair_outline_color_b` | int 0–255 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Trefferanzeige-Dauer | autoexec.cfg | `citadel_crosshair_hit_marker_duration` | float 0–2 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Crosshair | Heldenspezifische Crosshairs aus | autoexec.cfg | `citadel_crosshair_disable_hero_specific_crosshairs` | boolword false/true | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Maus | Maus-Sensitivität | autoexec.cfg | `sensitivity` | float 0.01–20 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Maus | Zoom-Sensitivität (Faktor) | autoexec.cfg | `zoom_sensitivity_ratio` | float 0.01–5 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Maus | Vertikaler Sensitivitätsfaktor | autoexec.cfg | `sensitivity_y_scale` | float 0.1–3 | ja | noch ungeprüft | direkt (CITADEL-Abschnitt in autoexec.cfg) | optilock-cvarlist |
| Erweitert | Kamera-FOV (Held) | gameinfo.gi | `GameInfo/ConVars/citadel_camera_hero_fov` | float 60–130 | ja | noch ungeprüft | nur Entwurf – wird nicht angewendet | optilock-cvarlist, optilock-gameinfo |
| Erweitert | Seitenverhältnis-Override | gameinfo.gi | `GameInfo/ConVars/r_aspectratio` | float 0–4 | ja | noch ungeprüft | nur Entwurf – wird nicht angewendet | optilock-cvarlist, optilock-gameinfo |

Gerätespezifische Kopfeinträge der video.txt (nie übernommen, nie verändert): `Version`, `VendorID`, `DeviceID`.

## Belege

- **optilock-videotxt-screenshot** – [OptiLock – Beispielbild einer vom Spiel geschriebenen video.txt (Version 20)](https://github.com/dacooderr/OptiLock/blob/main/OptiLock%20FPS%20Config%20(Recommended)/videotxtexample.png) (Quelle vom 2026-09-29, geprüft 2026-09-30): Zeigt Dateikopf "video.cfg", Version 20, VendorID/DeviceID und alle setting.*-Schlüssel. Schlüsselnamen belegt; Bedeutung der Werte nicht.
- **optilock-cvarlist** – [OptiLock cvarlist.md – ConVar-Liste mit Standardwerten und Flags](https://github.com/dacooderr/OptiLock/blob/main/cvarlist.md) (Quelle vom 2026-09-29, geprüft 2026-09-30): Community-Export der ConVars (Name, Beschreibung, Standard, Flags). Build-Stand nicht angegeben.
- **optilock-gameinfo** – [OptiLock gameinfo.gi (ver. 4.6)](https://github.com/dacooderr/OptiLock/blob/main/OptiLock%20FPS%20Config%20(Recommended)/gameinfo.gi) (Quelle vom 2026-09-29, geprüft 2026-09-30): Belegt die Struktur GameInfo → ConVars und dort gesetzte Variablen. Performance-Versprechen des Presets sind nicht übernommen.
- **skipeo-autoexec** – [Skip-eo Deadlock-Config autoexec.cfg (als veraltet markiert)](https://github.com/Skip-eo/Deadlock-Config) (Quelle vom 2025-04-22, geprüft 2026-09-30): Historische Community-Angabe zu autoexec.cfg im cfg-Ordner und zu r_low_latency (0/1/2). Veraltet – nur Hinweis, kein Beleg für den aktuellen Build.
