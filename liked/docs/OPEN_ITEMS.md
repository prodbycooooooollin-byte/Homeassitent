# Offene externe Voraussetzungen

Diese Punkte blockieren die Freigabe als „fertiges Spiel mit automatischem Like-Import“. Der Rest der Anwendung
(Spielablauf, Netzwerk, Design, Sounds, Installer) ist umgesetzt und getestet, soweit es in der Build-Umgebung
möglich war (siehe TEST_REPORT.md).

1. **TikTok-Developer-App mit Freigaben:** Login Kit (Web) sowie **Data Portability API** mit Scope
   `portability.activity.single` oder `.ongoing`. Freigegeben wird durch TikTok, nicht durch uns.
2. **Zustimmende Testperson** mit Konto aus dem EWR oder dem Vereinigten Königreich (Regionseinschränkung der
   Portability API) und genügend Likes (≥ 10), für Schritte 1–9 des Integrationsnachweises.
3. **Realtest des Embed Players in der installierten App** (Origin `app://liked`, Sandbox-iframe, Autoplay mit Ton)
   und Kalibrierung der Start- und Buffering-Toleranzen mit echten Clips.
4. **Server im Internet** mit Domain und HTTPS/WSS (siehe SERVER.md) und dessen Adresse als `LIKED_SERVER_URL` für Builds.
5. **Test über getrennte Internetanschlüsse** mit vier Personen (Abnahmefall 1).
6. **Optional: Code-Signatur** für Windows gegen SmartScreen-Warnungen und für echte Update-Authentizität.
7. **Release-Hosting für Updates:** öffentliches Repository oder eigener Download-Server (siehe RELEASE.md).
8. **Namensprüfung** für „LIKED“ vor einer Veröffentlichung.
9. **Rechtliches:** Datenschutzhinweis für Spieler (welche Likes der Lobby gezeigt werden, Speicherdauer),
   Einhaltung der TikTok-Entwicklerrichtlinien für die beantragte Nutzung. Der experimentelle Web-Adapter ist vor
   einer Aktivierung ebenfalls auf Vereinbarkeit mit den TikTok-Nutzungsbedingungen zu prüfen.
