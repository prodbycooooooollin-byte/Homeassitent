# Funktionsmatrix

Recherchestand: 24.09.2026. `developer.spotify.com` und `dev.twitch.tv` waren aus der
Build-Umgebung nicht direkt abrufbar (Netzwerkrichtlinie). Die Angaben stammen aus
Suchergebnissen zu den offiziellen Seiten, dem Spotify-Developer-Blog, der
Änderungsdokumentation von `rspotify` (Issue #550) sowie dem Twitch-CLI-Repository.
**Vor dem Livebetrieb bitte die verlinkten Primärquellen erneut prüfen.**

| Funktion | Benötigte API | Berechtigung | Einschränkung | Alternative |
|---|---|---|---|---|
| Spotify-Anmeldung | Authorization Code mit PKCE (`/authorize`, `/api/token`) | – | Loopback-Redirect nur mit expliziter IP `127.0.0.1` (kein `localhost`). Development Mode: App-Besitzer braucht **Premium**, max. **5** freigeschaltete Nutzer, 1 Client-ID pro Entwickler (ab 11.02./09.03.2026). | Extended Quota Mode (Antrag bei Spotify, für öffentliche Verteilung nötig) |
| Token-Erneuerung | `POST /api/token` `grant_type=refresh_token` + `client_id` | – | Refresh Tokens laufen **6 Monate nach der ursprünglichen Autorisierung** ab; Refresh verlängert nicht (für neue Apps sofort, für bestehende ab 20.07.2026). Danach `invalid_grant`. | Erneute Anmeldung (ON AIR fordert gezielt dazu auf und warnt ab Tag 150) |
| Now Playing | `GET /me/player` | `user-read-playback-state`, `user-read-currently-playing` | 204 = keine aktive Wiedergabe. Kein Push/WebSocket in der Web API → Polling: 1,5 s beim Abspielen, 2 s pausiert, 5 s ohne Wiedergabe, gezielt zum Titelende (+250 ms); im Hintergrund seltener. | – |
| Song-Farben | Cover-Bild von `i.scdn.co` / `*.spotifycdn.com` | – | Nur Spotify-Bildserver, max. 3 MB, Ergebnis zwischengespeichert. | Standardfarben |
| Transport (Skip, Zurück, Pause, Play) | `POST /me/player/next`, `/previous`, `PUT /pause`, `/play` | `user-modify-playback-state` | Nur mit **Spotify Premium**; 404 `NO_ACTIVE_DEVICE` ohne aktives Gerät. Reihenfolge mit anderen Player-Aufrufen nicht garantiert. | – |
| Geräte / Übertragung | `GET /me/player/devices`, `PUT /me/player` | `user-read-playback-state`, `user-modify-playback-state` | Geräte-IDs nicht dauerhaft stabil. ON AIR überträgt nur auf ausdrückliche Auswahl. | – |
| Request an Spotify übergeben | `POST /me/player/queue?uri=…` | `user-modify-playback-state` | Premium. **Kein Entfernen, kein Umsortieren, keine Idempotenz**. | Lokale Queue in ON AIR, sparsame Übergabe (Standard: 1 Titel vorab) |
| Spotify-Queue lesen (Abgleich) | `GET /me/player/queue` | `user-read-playback-state` | Zeigt nur einen Ausschnitt; gleiche Titel aus anderer Quelle sind nicht unterscheidbar. | Unklare Fälle werden zur Entscheidung angezeigt |
| Suche für Requests | `GET /search?type=track` | – (Nutzertoken) | Development Mode: `limit` max. **10**, Standard 5 (Feb. 2026). | – |
| Track per Link | `GET /tracks/{id}` | – | „Get Several Tracks“ wurde im Development Mode entfernt; Einzelabruf wird genutzt. **Vor Livebetrieb prüfen.** Felder `popularity`, `available_markets`, `external_ids` entfallen. | Suche nach Titel |
| Explicit-Filter | Feld `explicit` im Track-Objekt | – | Nur, solange Spotify das Feld liefert. | Sperrliste |
| Premium-Erkennung | – | – | Feld `product` aus `/me` im Development Mode entfernt → nicht vorab prüfbar. | Diagnose erkennt `PREMIUM_REQUIRED` bei 403 |
| Rate Limits | alle | – | Rollierendes 30-s-Fenster, Umfang undokumentiert; 429 mit `Retry-After`. Eine eigene Kontingent-Fehlerkennung ist nicht dokumentiert. | ON AIR pausiert global; Sperren ≥ 10 min werden als „Kontingent erschöpft“ angezeigt |
| Twitch-Anmeldung | Device Code Grant Flow (`/oauth2/device`, `/oauth2/token`) | `user:read:chat`, `user:write:chat` | Öffentlicher Client: **kein PKCE**, kein Secret; Refresh Tokens **einmalig verwendbar**, verfallen nach **30 Tagen** Inaktivität. | Confidential Client nur mit Backend (spätere Ausbaustufe) |
| Token-Validierung | `GET /oauth2/validate` | – | Twitch verlangt Validierung beim Start und stündlich. | – |
| Chat lesen | EventSub WebSocket `channel.chat.message` v1 | `user:read:chat` | Abo innerhalb von 10 s nach Welcome (sonst 4003). Keepalive 10–600 s; ON AIR nutzt 30 s. Doppelte Zustellung möglich. Shared Chat (gemeinsam streamen): Nachrichten anderer Kanäle kommen mit `source_broadcaster_user_id` mit und werden ignoriert. | – |
| Chat schreiben | `POST /helix/chat/messages` | `user:write:chat` | 500 Zeichen; Twitch-Ratelimits. ON AIR drosselt selbst (Standard 1,2 s Abstand, max. 5 in Warteschlange). | Antworten abschaltbar |
| Kanalpunkte: Belohnung | Helix `POST/PATCH/GET /channel_points/custom_rewards` (`only_manageable_rewards`) | `channel:manage:redemptions` (inkrementell angefordert) | Nur Affiliates/Partner (sonst 403). Verwalten nur für Belohnungen, die **dieselbe Client-ID** angelegt hat; Titel pro Kanal eindeutig. | Deaktivieren statt Löschen |
| Kanalpunkte: Einlösungen | EventSub `channel.channel_points_custom_reward_redemption.add` / `.update` (alle Belohnungen des Kanals, damit fremde sichtbar werden), Helix `GET/PATCH …/redemptions` | `channel:manage:redemptions` | Erfüllen/Stornieren nur bei Status `UNFULFILLED` und nur für eigene Belohnungen; Stornieren erstattet die Punkte. Fremde Belohnung nutzbar, dann ohne Erstattung/Pause. | Prüfung durch Streamer, wenn Wiedergabe nicht beobachtet |
| Live-Status (Update-Hinweis) | Helix `GET /streams?user_id=` | – | Nur Hinweis; unbekannt, wenn Twitch nicht verbunden. | – |
| App-Updates | GitHub Releases (`latest.json` im Release `on-air-stable`), optional `tauri-plugin-updater` | – | Download ohne Anmeldung nur aus öffentlichem Repository. Standard: Herkunft + SHA-256; mit hinterlegtem Schlüssel zusätzlich Signatur. | eigener Release-Server |
| OBS-Anzeige | lokaler HTTP-Server (Browser Source), SSE | – | Nur `127.0.0.1`. Metadaten ≠ Senderechte an der Musik. | Now-Playing-Textdatei |
| OBS-Dock | lokaler HTTP-Server (`/dock`, OBS „Benutzerdefinierte Browser-Docks“) | – | Nur `127.0.0.1`; Schlüssel im URL-Fragment, Aktionen nur von eigener Herkunft. | App-Fenster / Kompaktmodus |
| Sammel-Playlist | `POST /me/playlists`, `POST /playlists/{id}/items` (Web API seit 02/2026; vorher `/users/{id}/playlists` bzw. `/tracks`) | `playlist-modify-private`, `playlist-modify-public` | Max. 10.000 Titel je Playlist; max. 100 Titel je Aufruf; schreibt nur in eigene Playlists. | Automatisch „Teil 2“; gelöschte Playlist wird neu angelegt |
| Eigene Chatbefehle | wie Chat schreiben | `user:write:chat` | Antwort max. 450 Zeichen; Platzhalter werden lokal ersetzt, Chat-Eingaben nie erneut ausgewertet. | – |
| `!playlist` | Wiedergabekontext aus `GET /me/player`, Name über `GET /playlists/{id}?fields=name,public` | – (Nutzertoken) | Nur Playlist-/Album-Kontext; Name ggf. nicht abrufbar (dann nur Link); private Playlists werden nicht geteilt; kein Download möglich. | Standard-Link in den Einstellungen |
| Universal Request: YouTube | oEmbed `youtube.com/oembed` (ohne Schlüssel); Data API v3 `videos.list`, `playlistItems.list` (API-Schlüssel) | – | Ohne Schlüssel keine Dauer und keine Playlists; 10.000 Einheiten/Tag. | Songlink / „Künstler – Titel“ |
| Universal Request: Apple Music | iTunes Lookup API (öffentlich); Apple Music API `catalog/{sf}/songs`, `…/playlists` (Developer Token) | – | Lookup-API gedrosselt (403); Playlists und ISRC nur mit Developer Token (Apple Developer Program). | – |
| Universal Request: SoundCloud | oEmbed (ohne Zugang); API `/resolve`, `/tracks` mit Client-Credentials-Token | – | Ohne Zugang keine Dauer/Sets; private Inhalte nicht lesbar. | – |
| Playlist-Auswahl Spotify | `GET /playlists/{id}`, `/playlists/{id}/items`, `/albums/{id}/tracks` | – (Nutzertoken) | Development Mode: Playlist-Inhalte nur für eigene/gemeinsame Playlists (sonst 403 → „nicht zugänglich“); Tracks ohne `external_ids`. | Einzelner Songlink |
| Abgleich per ISRC | `GET /search?q=isrc:…&type=track` | – | ISRC nur, wenn die Quelle sie liefert (Apple mit Token, teils SoundCloud). | Titel/Künstler/Version/Dauer |

## Quellen

- Spotify PKCE: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Token-Erneuerung: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Spotify Refresh-Token-Ablauf (Blog, 18.06.2026): https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration
- Spotify Development-Mode-Änderungen: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide und https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Spotify Rate Limits / Quota Modes: https://developer.spotify.com/documentation/web-api/concepts/rate-limits, https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify Add to Queue: https://developer.spotify.com/documentation/web-api/reference/add-to-queue
- Änderungsliste (Feb. 2026) aus `rspotify`: https://github.com/ramsayleung/rspotify/issues/550
- Twitch EventSub WebSocket: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- Twitch Kanalpunkte (Custom Rewards, Redemptions): https://dev.twitch.tv/docs/api/reference/#create-custom-rewards, https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- Tauri Updater: https://v2.tauri.app/plugin/updater/
- Twitch Tokens/DCF: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/, https://dev.twitch.tv/docs/authentication/refresh-tokens/
- YouTube Data API: https://developers.google.com/youtube/v3/docs/playlistItems/list, https://developers.google.com/youtube/v3/docs/videos/list
- Apple Music API: https://developer.apple.com/documentation/applemusicapi, iTunes Search/Lookup: https://performance-partners.apple.com/search-api
- SoundCloud API-Leitfaden: https://developers.soundcloud.com/docs/api/guide
