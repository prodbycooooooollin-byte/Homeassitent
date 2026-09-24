//! Abnahmetests (Abschnitt 10 der Anforderungen) gegen kontrollierte Fake-Provider.
//! Alle Tests sind SIMULIERT – sie ersetzen keinen realen Langzeittest.

mod common;

use common::*;
use onair_core::auth::AuthStatus;
use onair_core::error::ApiError;
use onair_core::http::Method;
use onair_core::model::PlaybackView;
use onair_core::queue::{RequestStatus, Requester, SubmitOutcome, Source};
use onair_core::runtime::{Endpoints, Runtime, RuntimeConfig, SPOTIFY_SECRET_KEY};
use onair_core::settings::{Role, Settings};
use onair_core::spotify::service::{DeviceState, LinkState};
use onair_core::storage::Db;
use std::sync::Arc;
use std::time::Duration;

fn endpoints() -> Endpoints {
    Endpoints {
        spotify_accounts: ACCOUNTS.into(),
        spotify_api: API.into(),
        twitch_id: "http://fake-twitch-id".into(),
        twitch_helix: "http://fake-helix".into(),
        twitch_ws: "ws://127.0.0.1:9".into(),
    }
}

fn open_settings() -> Settings {
    let mut s = Settings::default();
    s.spotify.client_id = "client".into();
    s.requests.open = true;
    s.requests.user_cooldown_s = 0;
    s.requests.per_user_limit = 10;
    s
}

async fn start_runtime(h: &Harness, db: Db, settings: Settings) -> Arc<Runtime> {
    settings.save(&db).unwrap();
    // Tokens wie nach einer echten Anmeldung im Secret Store ablegen.
    let _ = h.tokens(SPOTIFY_SECRET_KEY, 3_600_000);
    Runtime::start(RuntimeConfig {
        db,
        data_dir: None,
        secrets: h.secrets.clone(),
        http: h.transport.clone(),
        clock: h.clock.clone(),
        endpoints: endpoints(),
        start_overlay: false,
        app_version: "test".into(),
    })
    .await
}

async fn wait_for(what: &str, mut cond: impl FnMut() -> bool, max: Duration) {
    let start = tokio::time::Instant::now();
    while !cond() {
        if start.elapsed() > max {
            panic!("Zeitüberschreitung beim Warten auf: {what}");
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn viewer(n: u32) -> Requester {
    Requester { id: format!("twitch:{n}"), name: format!("viewer{n}"), role: Role::Everyone }
}

// 1) Access Token läuft während aktiver Nutzung ab: Erneuerung ohne Verlust der lokalen Queue.
#[tokio::test(start_paused = true)]
async fn token_expiry_during_use_keeps_queue() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    for i in 0..3 {
        let o = rt.queue.submit_query(&format!("song {i}"), viewer(i), Source::Chat, Some(&format!("ev{i}")), None).await;
        assert!(matches!(o, SubmitOutcome::Accepted { .. }), "{o:?}");
    }
    let before = rt.queue.store.pending().len();
    // Token serverseitig ungültig machen und Ablaufzeit überschreiten.
    h.fake.lock().unwrap().expire_all_tokens();
    tokio::time::sleep(Duration::from_secs(3_700)).await;
    wait_for("online nach Refresh", || rt.spotify_state.borrow().is_online(), Duration::from_secs(30)).await;
    assert!(h.fake.lock().unwrap().refresh_count >= 1);
    assert!(matches!(rt.spotify_tokens.status(), AuthStatus::SignedIn { .. }));
    assert_eq!(rt.queue.store.pending().len(), before, "lokale Queue unverändert");
}

// 2) Viele gleichzeitige Anfragen bemerken einen abgelaufenen Token: genau ein Refresh.
#[tokio::test(start_paused = true)]
async fn concurrent_requests_share_one_refresh() {
    let h = Harness::new();
    h.transport.set_delay(Duration::from_millis(200));
    // Fall A: Server lehnt das Token ab (401), lokal gilt es noch.
    let tokens = h.tokens("a", 3_600_000);
    let client = h.client(tokens.clone());
    h.fake.lock().unwrap().expire_all_tokens();
    let futs: Vec<_> = (0..25).map(|_| { let c = client.clone(); tokio::spawn(async move { c.playback().await }) }).collect();
    for f in futs {
        let r = f.await.unwrap();
        assert!(r.is_ok(), "{r:?}");
    }
    assert_eq!(h.fake.lock().unwrap().refresh_count, 1, "401-Fall: genau ein Refresh");

    // Fall B: Token lokal abgelaufen (Ablaufzeit erreicht).
    let h = Harness::new();
    h.transport.set_delay(Duration::from_millis(200));
    let tokens = h.tokens("b", 30_000); // innerhalb des 60-s-Sicherheitspuffers
    let client = h.client(tokens);
    let futs: Vec<_> = (0..25).map(|_| { let c = client.clone(); tokio::spawn(async move { c.devices().await }) }).collect();
    for f in futs {
        let r = f.await.unwrap();
        assert!(r.is_ok(), "{r:?}");
    }
    assert_eq!(h.fake.lock().unwrap().refresh_count, 1, "Ablauf-Fall: genau ein Refresh");
}

// 2b) Refresh ohne neuen Refresh Token behält den bisherigen.
#[tokio::test(start_paused = true)]
async fn refresh_without_new_refresh_token_keeps_old_one() {
    let h = Harness::new();
    h.fake.lock().unwrap().refresh_mode = RefreshMode::OkWithoutNewRefreshToken;
    let tokens = h.tokens("k", 10_000);
    h.client(tokens.clone()).playback().await.unwrap();
    let raw = onair_core::secrets::SecretStore::load(&*h.secrets, "k").unwrap().unwrap();
    let set: onair_core::auth::TokenSet = serde_json::from_str(&raw).unwrap();
    assert_eq!(set.refresh_token.as_deref(), Some("rt-0"));
    assert_eq!(set.access_token, "at-1");
}

// 3) Internet fällt zwei Minuten aus: kein Logout, kontrollierte Wiederaufnahme ohne Anfrageflut.
#[tokio::test(start_paused = true)]
async fn two_minute_outage_no_logout_and_bounded_requests() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().offline = true;
    h.transport.clear_log();
    let start = tokio::time::Instant::now();
    let mut saw_offline = false;
    while start.elapsed() < Duration::from_secs(120) {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let st = rt.spotify_state.borrow().clone();
        assert!(matches!(st.auth, AuthStatus::SignedIn { .. }), "kein Logout während Ausfall");
        saw_offline |= matches!(st.link, LinkState::Offline { .. });
    }
    assert!(saw_offline, "Status zeigt Ausfall");
    let attempts = h.transport.log.lock().unwrap().len();
    assert!(attempts <= 25, "zu viele Anfragen während Ausfall: {attempts}");
    h.fake.lock().unwrap().offline = false;
    wait_for("Wiederaufnahme", || rt.spotify_state.borrow().is_online(), Duration::from_secs(130)).await;
    assert_eq!(h.fake.lock().unwrap().refresh_count, 0, "keine unnötige Neuanmeldung");
}

// 4) Standby und Aufwachen: Erholung ohne doppelte Worker.
#[tokio::test(start_paused = true)]
async fn wake_recovery_does_not_duplicate_workers() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().is_playing = false; // Pause → stabiles Intervall (8 s)
    tokio::time::sleep(Duration::from_secs(10)).await;
    h.transport.clear_log();
    tokio::time::sleep(Duration::from_secs(80)).await;
    let before = h.count(Method::Get, "/me/player");
    for _ in 0..5 {
        rt.recover_all(); // mehrfaches Aufwachen/„Verbindung prüfen“
    }
    tokio::time::sleep(Duration::from_secs(1)).await;
    h.transport.clear_log();
    tokio::time::sleep(Duration::from_secs(80)).await;
    let after = h.count(Method::Get, "/me/player");
    assert!(before >= 8 && after <= before + 1, "Polling-Rate unverändert (vorher {before}, nachher {after})");
}

// 5) Spotify geschlossen bzw. Gerät gewechselt: korrekter Status statt Loginaufforderung.
#[tokio::test(start_paused = true)]
async fn spotify_closed_or_device_changed_is_not_a_logout() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().no_session = true; // Spotify geschlossen → HTTP 204
    wait_for("kein Gerät", || matches!(rt.spotify_state.borrow().device, DeviceState::NoActiveDevice), Duration::from_secs(30)).await;
    let st = rt.spotify_state.borrow().clone();
    assert!(matches!(st.auth, AuthStatus::SignedIn { .. }));
    assert!(matches!(st.link, LinkState::Online));
    assert!(matches!(st.playback, PlaybackView::Idle { .. }));
    // Request während kein Gerät aktiv ist: angenommen, aber nicht übergeben.
    let o = rt.queue.submit_query("x", viewer(1), Source::Chat, Some("e1"), None).await;
    assert!(matches!(o, SubmitOutcome::Accepted { .. }));
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 0);
    {
        let mut f = h.fake.lock().unwrap();
        f.no_session = false;
        f.device = "Handy".into();
    }
    wait_for("neues Gerät", || matches!(&rt.spotify_state.borrow().device, DeviceState::Active { device } if device.name == "Handy"), Duration::from_secs(30)).await;
    wait_for("übergeben", || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(10)).await;
}

// 6) HTTP 429 bzw. Quota-Erschöpfung: vorgeschriebene Pause, keine Anfrageflut.
#[tokio::test(start_paused = true)]
async fn rate_limit_is_respected() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().rate_limit_s = Some(30);
    wait_for("rate limited", || matches!(rt.spotify_state.borrow().link, LinkState::RateLimited { .. }), Duration::from_secs(10)).await;
    h.transport.clear_log();
    // Während der Pause dürfen weder Worker noch Nutzeraktionen das Netz erreichen.
    for _ in 0..10 {
        let r = rt.search("abc").await;
        assert!(matches!(r, Err(ApiError::RateLimited { .. })));
    }
    tokio::time::sleep(Duration::from_secs(25)).await;
    assert_eq!(h.transport.log.lock().unwrap().len(), 0, "keine Anfragen während Retry-After");
    h.fake.lock().unwrap().rate_limit_s = None;
    wait_for("wieder online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(15)).await;

    // Sehr lange Sperre wird als Kontingent-Erschöpfung angezeigt.
    h.fake.lock().unwrap().rate_limit_s = Some(3_600);
    wait_for("quota", || matches!(rt.spotify_state.borrow().link, LinkState::QuotaExhausted { .. }), Duration::from_secs(15)).await;
    h.transport.clear_log();
    tokio::time::sleep(Duration::from_secs(600)).await;
    assert_eq!(h.transport.log.lock().unwrap().len(), 0, "Aufrufe ausgesetzt");
}

// 7) Vorübergehende 5xx-Antworten: begrenzte Wiederholungen, Tokens bleiben.
#[tokio::test(start_paused = true)]
async fn transient_5xx_limited_retries_tokens_kept() {
    let h = Harness::new();
    let tokens = h.tokens("k", 3_600_000);
    let client = h.client(tokens.clone());
    h.fake.lock().unwrap().fail_5xx = 2;
    assert!(client.playback().await.is_ok(), "zwei 503 werden überbrückt");
    h.fake.lock().unwrap().fail_5xx = 100;
    h.transport.clear_log();
    assert!(matches!(client.playback().await, Err(ApiError::Server { status: 503 })));
    assert_eq!(h.transport.log.lock().unwrap().len(), 3, "genau 1 + 2 Wiederholungen");
    assert!(matches!(tokens.status(), AuthStatus::SignedIn { .. }));

    // Refresh-Endpunkt liefert 5xx oder Netzfehler: Zugangsdaten bleiben erhalten.
    for mode in [RefreshMode::ServerError, RefreshMode::Network] {
        let h = Harness::new();
        h.fake.lock().unwrap().refresh_mode = mode;
        let tokens = h.tokens("k", 1_000);
        let r = h.client(tokens.clone()).playback().await;
        assert!(r.as_ref().err().map(|e| e.is_transient()).unwrap_or(false), "{mode:?}: {r:?}");
        assert!(matches!(tokens.status(), AuthStatus::SignedIn { .. }), "{mode:?}");
        assert!(onair_core::secrets::SecretStore::load(&*h.secrets, "k").unwrap().is_some());
    }
}

// 8) Refresh Token tatsächlich ungültig: gezielte Loginaufforderung, lokale Daten bleiben.
#[tokio::test(start_paused = true)]
async fn invalid_grant_requests_login_and_keeps_data() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    rt.queue.submit_query("x", viewer(1), Source::Chat, Some("e1"), None).await;
    rt.queue.submit_query("y", viewer(2), Source::Chat, Some("e2"), None).await;
    let pending = rt.queue.store.pending().len();
    {
        let mut f = h.fake.lock().unwrap();
        f.refresh_mode = RefreshMode::InvalidGrant;
        f.expire_all_tokens();
    }
    wait_for("reauth", || matches!(rt.spotify_state.borrow().auth, AuthStatus::ReauthRequired { .. }), Duration::from_secs(30)).await;
    let refreshes = h.fake.lock().unwrap().refresh_count;
    tokio::time::sleep(Duration::from_secs(300)).await;
    assert_eq!(h.fake.lock().unwrap().refresh_count, refreshes, "keine Refresh-Schleife");
    assert_eq!(rt.queue.store.pending().len(), pending, "Queue erhalten");
    assert!(onair_core::settings::read(&rt.settings).requests.open, "Einstellungen erhalten");
}

// 9) Twitch liefert ein Event zweimal: ein Request und höchstens eine Antwort.
#[tokio::test(start_paused = true)]
async fn duplicate_twitch_event_creates_one_request_and_one_reply() {
    use onair_core::twitch::eventsub::ChatEvent;
    use onair_core::twitch::service::{handle_chat_for_test, TwitchDeps, TwitchService};
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    // Twitch-Fake: Chatnachrichten zählen.
    let helix_sends = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let hs = helix_sends.clone();
    let twitch_http = onair_core::http::FakeTransport::new(move |r| {
        if r.url.ends_with("/chat/messages") {
            hs.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            return Ok(onair_core::http::HttpResponse::json(200, serde_json::json!({"data": [{"message_id": "sent-1", "is_sent": true}]})));
        }
        Ok(onair_core::http::HttpResponse::new(404))
    });
    let secrets = Arc::new(onair_core::secrets::MemorySecretStore::default());
    let tw_tokens = onair_core::auth::TokenManager::load(
        "tw",
        Arc::new(onair_core::twitch::auth::TwitchTokenEndpoint { http: twitch_http.clone(), client_id: Arc::new(|| "c".into()), id_base: "http://x".into() }),
        secrets,
        h.clock.clone(),
    );
    tw_tokens
        .install(onair_core::auth::TokenSet { access_token: "tw".into(), refresh_token: Some("r".into()), expires_at_ms: h.clock.now_ms() + 3_600_000, scope: "user:read:chat user:write:chat".into(), authorized_at_ms: 0 })
        .unwrap();
    let (mut svc, _handle) = TwitchService::new(TwitchDeps {
        http: twitch_http.clone(),
        tokens: tw_tokens,
        client_id: Arc::new(|| "c".into()),
        id_base: "http://x".into(),
        helix_base: "http://helix".into(),
        ws_url: "ws://127.0.0.1:9".into(),
        queue: rt.queue.clone(),
        spotify: rt.spotify.clone(),
        spotify_state: rt.spotify_state.clone(),
        spotify_cmd: rt.spotify_cmd.clone(),
        settings: rt.settings.clone(),
        activity: rt.activity.clone(),
        bus: rt.bus.clone(),
        clock: h.clock.clone(),
    });
    svc.set_identity_for_test(onair_core::twitch::auth::Identity { user_id: "100".into(), login: "streamer".into(), scopes: vec![] });
    svc.spawn_chat_sender_for_test();
    let ev = ChatEvent {
        message_id: "chat-1".into(),
        broadcaster_id: "100".into(),
        user_id: "200".into(),
        user_login: "viewer".into(),
        user_name: "Viewer".into(),
        text: "!sr some song".into(),
        badges: vec![],
        reward_id: None,
    };
    handle_chat_for_test(&svc, ev.clone()).await;
    handle_chat_for_test(&svc, ev).await; // doppelte Zustellung
    tokio::time::sleep(Duration::from_secs(5)).await;
    let from_viewer = rt.queue.store.pending().into_iter().filter(|r| r.requester.id == "twitch:200").count();
    assert_eq!(from_viewer, 1, "genau ein Request");
    assert_eq!(helix_sends.load(std::sync::atomic::Ordering::SeqCst), 1, "genau eine Chatantwort");
}

// 10) Absturz nach Queue-Übergabe, aber vor Bestätigung: keine blinde doppelte Übergabe.
#[tokio::test(start_paused = true)]
async fn crash_after_handoff_is_reconciled_not_resent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    let uri;
    {
        let rt = start_runtime(&h, Db::open(&path).unwrap(), open_settings()).await;
        wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
        // Handoff-Zustand vor dem Absturz nachstellen: gesendet, Spotify hat übernommen,
        // Bestätigung nie gespeichert.
        h.fake.lock().unwrap().add_mode = AddMode::AppliedButTimeout;
        rt.queue.submit_query("crash song", viewer(1), Source::Chat, Some("c1"), None).await;
        wait_for("uncertain", || !rt.queue.store.by_status(RequestStatus::Uncertain).is_empty() || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(10)).await;
        let r = rt.queue.store.pending().into_iter().find(|r| r.requester.id == "twitch:1").unwrap();
        uri = r.track.unwrap().uri;
        // Zustand „HandingOff“ erzwingen (Absturz genau zwischen Senden und Speichern).
        rt.db.conn().execute("UPDATE requests SET status='handing_off', reason=NULL WHERE requester_id='twitch:1'", []).unwrap();
        rt.shutdown().await;
    }
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 1);
    h.fake.lock().unwrap().add_mode = AddMode::Ok;
    let rt = start_runtime(&h, Db::open(&path).unwrap(), open_settings()).await;
    wait_for("abgeglichen", || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(20)).await;
    tokio::time::sleep(Duration::from_secs(10)).await;
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 1, "nicht erneut gesendet");
    assert_eq!(h.fake.lock().unwrap().queue.iter().filter(|u| **u == uri).count(), 1);

    // Variante: Titel nicht in Spotifys Queue auffindbar → Entscheidung nötig, kein Senden.
    rt.db.conn().execute("UPDATE requests SET status='handing_off' WHERE requester_id='twitch:1'", []).unwrap();
    h.fake.lock().unwrap().queue.clear();
    rt.shutdown().await;
    drop(rt);
    let rt = start_runtime(&h, Db::open(&path).unwrap(), open_settings()).await;
    wait_for("entscheidung", || rt.queue.store.by_status(RequestStatus::Uncertain).iter().any(|r| r.reason.as_deref() == Some("not_in_spotify_queue")), Duration::from_secs(20)).await;
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 1, "weiterhin keine blinde Übergabe");
    // Gezielte Entscheidung: erneut übergeben.
    let id = rt.queue.store.by_status(RequestStatus::Uncertain)[0].id.clone();
    rt.queue.retry(&id).await.unwrap();
    wait_for("übergeben", || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(10)).await;
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 2);
}

// 10b) Unklarer Ausgang zur Laufzeit wird nicht wiederholt.
#[tokio::test(start_paused = true)]
async fn ambiguous_handoff_is_not_retried() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().add_mode = AddMode::AppliedButTimeout;
    rt.queue.submit_query("a", viewer(1), Source::Chat, Some("x1"), None).await;
    wait_for("bestätigt per Abgleich", || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(20)).await;
    tokio::time::sleep(Duration::from_secs(20)).await;
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 1);
    assert_eq!(h.fake.lock().unwrap().queue.len(), 1);
}

// 11) App-Neustart: Einstellungen, Request-Zustände und OBS-Anbindung werden wiederhergestellt.
#[tokio::test(start_paused = true)]
async fn restart_restores_settings_requests_and_overlay() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let mut s = open_settings();
    s.overlay.port = port;
    s.requests.max_queue = 17;
    let h = Harness::new();
    let ids: Vec<String>;
    {
        let rt = start_runtime(&h, Db::open(&path).unwrap(), s.clone()).await;
        wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
        h.fake.lock().unwrap().no_session = true; // keine Übergabe, Requests bleiben lokal
        wait_for("idle", || matches!(rt.spotify_state.borrow().playback, PlaybackView::Idle { .. }), Duration::from_secs(20)).await;
        rt.queue.submit_query("one", viewer(1), Source::Chat, Some("r1"), None).await;
        rt.queue.submit_query("two", viewer(2), Source::Chat, Some("r2"), None).await;
        ids = rt.queue.store.pending().iter().map(|r| r.id.clone()).collect();
        rt.shutdown().await;
    }
    let db = Db::open(&path).unwrap();
    let _ = h.tokens(SPOTIFY_SECRET_KEY, 3_600_000);
    let rt = Runtime::start(RuntimeConfig {
        db,
        data_dir: None,
        secrets: h.secrets.clone(),
        http: h.transport.clone(),
        clock: h.clock.clone(),
        endpoints: endpoints(),
        start_overlay: true,
        app_version: "test".into(),
    })
    .await;
    assert_eq!(onair_core::settings::read(&rt.settings).requests.max_queue, 17);
    let now: Vec<String> = rt.queue.store.pending().iter().map(|r| r.id.clone()).collect();
    assert_eq!(now, ids);
    let snap = rt.snapshot().await;
    assert!(snap.overlay.running, "{:?}", snap.overlay.error);
    assert_eq!(snap.overlay.port, port);
    rt.shutdown().await;
}

// 12) Abmelden während laufender Requests: keine Wiederbelebung der alten Sitzung.
#[tokio::test(start_paused = true)]
async fn logout_during_requests_does_not_revive_session() {
    let h = Harness::new();
    h.transport.set_delay(Duration::from_millis(500));
    let tokens = h.tokens("k", 1_000); // erzwingt Refresh
    let client = h.client(tokens.clone());
    let c2 = client.clone();
    let pending = tokio::spawn(async move { c2.playback().await });
    tokio::time::sleep(Duration::from_millis(100)).await; // Refresh läuft
    tokens.sign_out();
    let r = pending.await.unwrap();
    assert!(matches!(r, Err(ApiError::SessionEnded) | Err(ApiError::NotSignedIn)), "{r:?}");
    assert_eq!(tokens.status(), AuthStatus::SignedOut, "Sitzung nicht wiederbelebt");
    assert!(onair_core::secrets::SecretStore::load(&*h.secrets, "k").unwrap().is_none());

    // Laufende API-Anfrage (ohne Refresh) während des Abmeldens.
    let h = Harness::new();
    h.transport.set_delay(Duration::from_millis(500));
    let tokens = h.tokens("k", 3_600_000);
    let client = h.client(tokens.clone());
    let c2 = client.clone();
    let pending = tokio::spawn(async move { c2.playback().await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    tokens.sign_out();
    assert!(matches!(pending.await.unwrap(), Err(ApiError::SessionEnded)));
    assert_eq!(tokens.status(), AuthStatus::SignedOut);
}

// Zusätzlich: Offline eingehende Requests werden nur als „Prüfung ausstehend“ gespeichert.
#[tokio::test(start_paused = true)]
async fn offline_requests_are_pending_until_spotify_returns() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().offline = true;
    wait_for("offline", || !rt.spotify_state.borrow().is_online(), Duration::from_secs(30)).await;
    let o = rt.queue.submit_query("later", viewer(5), Source::Chat, Some("o1"), None).await;
    assert!(matches!(o, SubmitOutcome::PendingOffline { .. }), "{o:?}");
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 0);
    h.fake.lock().unwrap().offline = false;
    wait_for("geprüft und übergeben", || rt.queue.store.pending().iter().any(|r| r.requester.id == "twitch:5" && matches!(r.status, RequestStatus::HandedOff | RequestStatus::Playing)), Duration::from_secs(150)).await;
}

// Zusätzlich: Übergabestrategie – höchstens `handoff_ahead` Titel gleichzeitig in Spotify,
// Beobachtung der Wiedergabe schließt Requests ab.
#[tokio::test(start_paused = true)]
async fn handoff_is_sparse_and_playback_is_observed() {
    let h = Harness::new();
    let rt = start_runtime(&h, Db::in_memory().unwrap(), open_settings()).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    for i in 0..3 {
        rt.queue.submit_query(&format!("s{i}"), viewer(i), Source::Chat, Some(&format!("h{i}")), None).await;
    }
    tokio::time::sleep(Duration::from_secs(5)).await;
    assert_eq!(h.count(Method::Post, "/me/player/queue"), 1, "nur ein Titel vorab in Spotify");
    assert_eq!(rt.queue.store.by_status(RequestStatus::Accepted).len(), 2);
    h.fake.lock().unwrap().advance(); // nächster Titel = Request
    wait_for("playing", || !rt.queue.store.by_status(RequestStatus::Playing).is_empty(), Duration::from_secs(10)).await;
    wait_for("nächster übergeben", || h.count(Method::Post, "/me/player/queue") == 2, Duration::from_secs(10)).await;
    h.fake.lock().unwrap().advance();
    wait_for("abgeschlossen", || rt.queue.store.recent_finished(10).iter().any(|r| r.status == RequestStatus::Completed), Duration::from_secs(10)).await;
}

// Zusätzlich: Limits greifen auch bei gleichzeitig eintreffenden Requests.
#[tokio::test(start_paused = true)]
async fn concurrent_requests_respect_user_limit() {
    let h = Harness::new();
    let mut s = open_settings();
    s.requests.per_user_limit = 1;
    let rt = start_runtime(&h, Db::in_memory().unwrap(), s).await;
    wait_for("online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(10)).await;
    h.fake.lock().unwrap().no_session = true;
    wait_for("idle", || matches!(rt.spotify_state.borrow().playback, PlaybackView::Idle { .. }), Duration::from_secs(20)).await;
    let futs: Vec<_> = (0..5)
        .map(|i| {
            let q = rt.queue.clone();
            tokio::spawn(async move { q.submit_query(&format!("x{i}"), viewer(1), Source::Chat, Some(&format!("cc{i}")), None).await })
        })
        .collect();
    let mut accepted = 0;
    for f in futs {
        if matches!(f.await.unwrap(), SubmitOutcome::Accepted { .. }) {
            accepted += 1;
        }
    }
    assert_eq!(accepted, 1);
}
