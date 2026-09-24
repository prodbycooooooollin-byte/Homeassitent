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
| Now Playing | `GET /me/player` | `user-read-playback-state`, `user-read-currently-playing` | 204 = keine aktive Wiedergabe. Kein Push/WebSocket in der Web API → Polling. | – |
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
| Chat lesen | EventSub WebSocket `channel.chat.message` v1 | `user:read:chat` | Abo innerhalb von 10 s nach Welcome (sonst 4003). Keepalive 10–600 s; ON AIR nutzt 30 s. Doppelte Zustellung möglich. | – |
| Chat schreiben | `POST /helix/chat/messages` | `user:write:chat` | 500 Zeichen; Twitch-Ratelimits. ON AIR drosselt selbst (Standard 1,2 s Abstand, max. 5 in Warteschlange). | Antworten abschaltbar |
| Kanalpunkte | EventSub `channel.channel_points_custom_reward_redemption.add`, Helix Redemptions | `channel:read:redemptions` / `channel:manage:redemptions` | Rückerstattung nur für Rewards, die **dieselbe Client-ID** angelegt hat. | **Noch nicht umgesetzt** (nach stabilem Kern) |
| OBS-Anzeige | lokaler HTTP-Server (Browser Source), SSE | – | Nur `127.0.0.1`. Metadaten ≠ Senderechte an der Musik. | Now-Playing-Textdatei |

## Quellen

- Spotify PKCE: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Token-Erneuerung: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Spotify Refresh-Token-Ablauf (Blog, 18.06.2026): https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration
- Spotify Development-Mode-Änderungen: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide und https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Spotify Rate Limits / Quota Modes: https://developer.spotify.com/documentation/web-api/concepts/rate-limits, https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify Add to Queue: https://developer.spotify.com/documentation/web-api/reference/add-to-queue
- Änderungsliste (Feb. 2026) aus `rspotify`: https://github.com/ramsayleung/rspotify/issues/550
- Twitch EventSub WebSocket: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- Twitch Tokens/DCF: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/, https://dev.twitch.tv/docs/authentication/refresh-tokens/
