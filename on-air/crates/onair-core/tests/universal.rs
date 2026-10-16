//! Abnahmetests der fünf Komfortfunktionen: Universal Request, Austausch, Verlauf,
//! Playlist-Auswahl und Vorprüfung.
//! SIMULIERT gegen Fake-Spotify, Fake-Twitch und simulierte Metadaten-Anbieter –
//! keine echten Dienste, keine echten Konten.

mod common;

use common::*;
use onair_core::queue::flow::{ChatFlow, Notice};
use onair_core::queue::{RequestStatus, Requester, Source, SubmitOutcome};
use onair_core::resolve::{MatchMethod, SourceProvider};
use onair_core::runtime::{Endpoints, Runtime, RuntimeConfig, SPOTIFY_SECRET_KEY};
use onair_core::selection::Stage;
use onair_core::settings::{Role, Settings};
use onair_core::storage::Db;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

const SP_ID: &str = "4uLU6hMCjMI75M1A2tKUQC";

fn endpoints() -> Endpoints {
    Endpoints {
        spotify_accounts: ACCOUNTS.into(),
        spotify_api: API.into(),
        twitch_id: "http://fake-twitch-id".into(),
        twitch_helix: "http://fake-helix".into(),
        twitch_ws: "ws://127.0.0.1:9".into(),
    }
}

fn settings() -> Settings {
    let mut s = Settings::default();
    s.spotify.client_id = "client".into();
    s.twitch.client_id = "c".into();
    s.requests.open = true;
    s.requests.user_cooldown_s = 0;
    s.requests.per_user_limit = 20;
    s
}

async fn start(h: &Harness, db: Db, s: Settings) -> Arc<Runtime> {
    s.save(&db).unwrap();
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

async fn ready(rt: &Runtime) {
    wait_for("Spotify online", || rt.spotify_state.borrow().is_online(), Duration::from_secs(15)).await;
}

fn viewer(n: u32) -> Requester {
    Requester { id: format!("twitch:{n}"), name: format!("viewer{n}"), role: Role::Everyone }
}

fn code(o: &SubmitOutcome) -> String {
    match o {
        SubmitOutcome::Rejected { code, .. } => code.clone(),
        other => format!("{other:?}"),
    }
}

fn accepted_track(o: &SubmitOutcome) -> String {
    match o {
        SubmitOutcome::Accepted { request, .. } | SubmitOutcome::PendingReview { request } => request.track.as_ref().unwrap().id.clone(),
        other => panic!("nicht angenommen: {other:?}"),
    }
}

/// Katalog mit Original/Remix/Live und gleichnamigen Songs verschiedener Interpreten.
fn catalog(h: &Harness) {
    let mut f = h.fake.lock().unwrap();
    f.catalog = vec![
        cat(SP_ID, "Direkter Link", "Irgendwer", 180),
        cat("c0000000000000000000om", "One More Time", "Daft Punk", 320),
        cat("c0000000000000000000ol", "One More Time - Live", "Daft Punk", 400),
        cat("c0000000000000000000lv", "Levels", "Avicii", 200),
        cat("c0000000000000000000lr", "Levels - Skrillex Remix", "Avicii", 290),
        cat("c0000000000000000000hn", "Hurt", "Nine Inch Nails", 373),
        cat("c0000000000000000000hc", "Hurt", "Johnny Cash", 218),
        cat("c0000000000000000000s5", "Five Minutes", "Band", 300),
        cat("c0000000000000000000s6", "Six Minutes", "Band", 360),
        cat("c0000000000000000000s9", "Nine Minutes", "Band", 540),
    ];
}

fn yt(h: &Harness, id: &str, title: &str, channel: &str) {
    h.providers.lock().unwrap().yt_oembed.insert(id.into(), (title.into(), channel.into()));
}

// 1) Direkter Spotify-Link und eindeutiger externer Songlink → jeweils genau ein korrekter Request.
#[tokio::test(start_paused = true)]
async fn direct_and_external_links_create_exactly_one_request() {
    let h = Harness::new();
    catalog(&h);
    yt(&h, "dQw4w9WgXcQ", "Daft Punk - One More Time (Official Video)", "Daft Punk");
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;

    let a = rt.queue.submit_query(&format!("https://open.spotify.com/intl-de/track/{SP_ID}?si=abc"), viewer(1), Source::Chat, Some("e1"), None).await;
    assert_eq!(accepted_track(&a), SP_ID);
    let b = rt.queue.submit_query("https://youtu.be/dQw4w9WgXcQ?si=share", viewer(2), Source::Chat, Some("e2"), None).await;
    assert_eq!(accepted_track(&b), "c0000000000000000000om", "Original statt Live-Fassung");
    let req = rt.queue.store.pending().into_iter().find(|r| r.requester.id == "twitch:2").unwrap();
    let origin = req.origin.unwrap();
    assert_eq!(origin.provider, Some(SourceProvider::Youtube));
    assert_eq!(origin.method, MatchMethod::Metadata);
    assert_eq!(origin.url.as_deref(), Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    // Genau je ein Request, keine zusätzliche Auswahl.
    assert_eq!(rt.queue.store.pending().iter().filter(|r| r.requester.id == "twitch:2").count(), 1);
    assert!(rt.queue.store.awaiting().is_empty());
}

// 2) Original und Remix werden nicht verwechselt; uneindeutiger Treffer erfordert eine Auswahl.
#[tokio::test(start_paused = true)]
async fn remix_is_not_confused_and_ambiguity_needs_a_choice() {
    let h = Harness::new();
    catalog(&h);
    yt(&h, "aaaaaaaaaaa", "Avicii - Levels (Skrillex Remix)", "Skrillex Fans");
    yt(&h, "bbbbbbbbbbb", "Hurt", "Random Uploads");
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;
    let a = rt.queue.submit_query("https://www.youtube.com/watch?v=aaaaaaaaaaa", viewer(1), Source::Chat, Some("r1"), None).await;
    assert_eq!(accepted_track(&a), "c0000000000000000000lr");
    // Kanalname ist kein Interpret → zwei gleichnamige Songs → Auswahl, keine Annahme.
    let b = rt.queue.submit_query("https://www.youtube.com/watch?v=bbbbbbbbbbb", viewer(2), Source::Chat, Some("r2"), None).await;
    match &b {
        SubmitOutcome::NeedsChoice { request, prompt } => {
            assert_eq!(request.status, RequestStatus::AwaitingSelection);
            assert_eq!(prompt.stage, Stage::Version);
            assert_eq!(prompt.options.len(), 2, "{:?}", prompt.options);
        }
        other => panic!("{other:?}"),
    }
    let text = onair_core::twitch::commands::reply_for_outcome(&Settings::default().commands.replies, &b).unwrap();
    assert!(text.contains("1) Hurt") && text.contains("2) Hurt") && text.contains("!auswahl"), "{text}");
    // Nicht in der Warteschlange, bis gewählt wurde.
    assert!(!rt.queue.store.pending().iter().any(|r| r.requester.id == "twitch:2"));
}

// 3) Fehlende Spotify-Version, privat, nicht eingerichtet, Netzfehler: unterschiedliche Zustände.
#[tokio::test(start_paused = true)]
async fn failure_states_are_distinct_and_understandable() {
    let h = Harness::new();
    catalog(&h);
    yt(&h, "ccccccccccc", "Unbekannte Band - Gibt Es Nicht Auf Spotify", "x");
    h.providers.lock().unwrap().yt_private.insert("ddddddddddd".into());
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;
    let q = |s: &str, n: u32| {
        let rt = rt.clone();
        let s = s.to_string();
        async move { rt.queue.submit_query(&s, viewer(n), Source::Chat, Some(&format!("f{n}")), None).await }
    };
    let none = q("https://youtu.be/ccccccccccc", 1).await;
    let private = q("https://youtu.be/ddddddddddd", 2).await;
    let setup = q("https://www.youtube.com/playlist?list=PLabc", 3).await;
    h.providers.lock().unwrap().yt_down = true;
    let down = q("https://youtu.be/eeeeeeeeeee", 4).await;
    let other = q("https://www.deezer.com/track/1", 5).await;
    let codes = [code(&none), code(&private), code(&setup), code(&down), code(&other)];
    assert_eq!(codes, ["no_spotify_match", "source_not_accessible", "provider_setup_required", "provider_unavailable", "unsupported_content"]);
    let texts: std::collections::HashSet<String> = [&none, &private, &setup, &down, &other]
        .iter()
        .map(|o| match o {
            SubmitOutcome::Rejected { text, .. } => text.clone(),
            _ => unreachable!(),
        })
        .collect();
    assert_eq!(texts.len(), 5, "verständliche, unterschiedliche Meldungen");
    // Nichts wurde ungefragt eingereiht.
    assert!(rt.queue.store.pending().is_empty());
}

// 4) Zwei Zuschauer wählen gleichzeitig – keiner kann die Auswahl des anderen bestätigen.
#[tokio::test(start_paused = true)]
async fn selections_are_bound_to_the_viewer() {
    let h = Harness::new();
    catalog(&h);
    yt(&h, "bbbbbbbbbbb", "Hurt", "Random Uploads");
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    for n in [1, 2] {
        let o = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(n), Source::Chat, Some(&format!("s{n}")), None).await;
        assert!(matches!(o, SubmitOutcome::NeedsChoice { .. }), "{o:?}");
    }
    // Unbeteiligter hat keine Auswahl.
    assert!(matches!(rt.queue.choose(&ch, &viewer(3), 1).await, ChatFlow::Notice { notice: Notice::NoSelection }));
    // Zahlen außerhalb der Liste lösen nichts aus.
    assert!(matches!(rt.queue.choose(&ch, &viewer(1), 9).await, ChatFlow::Notice { notice: Notice::Invalid }));
    let (v1, v2) = (viewer(1), viewer(2));
    let (one, two) = tokio::join!(rt.queue.choose(&ch, &v1, 1), rt.queue.choose(&ch, &v2, 2));
    let t1 = match one {
        ChatFlow::Outcome { outcome } => accepted_track(&outcome),
        o => panic!("{o:?}"),
    };
    let t2 = match two {
        ChatFlow::Outcome { outcome } => accepted_track(&outcome),
        o => panic!("{o:?}"),
    };
    assert_ne!(t1, t2, "jeder bekam seine eigene Wahl");
    let mine = rt.queue.store.pending().into_iter().find(|r| r.requester.id == "twitch:1").unwrap();
    assert_eq!(mine.origin.unwrap().method, MatchMethod::UserChoice);
}

// 5) Austausch behält die Position; Fehler/Abbruch erhalten den Originalwunsch; ein Rennen gegen
// die Spotify-Übergabe erzeugt keinen Doppelrequest.
#[tokio::test(start_paused = true)]
async fn replace_keeps_position_and_never_duplicates() {
    let h = Harness::new();
    catalog(&h);
    let mut s = settings();
    s.requests.handoff_ahead = 1;
    let rt = start(&h, Db::in_memory().unwrap(), s).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    rt.queue.submit_query("daft punk one more time", viewer(1), Source::Chat, Some("p1"), None).await;
    wait_for("erster übergeben", || !rt.queue.store.by_status(RequestStatus::HandedOff).is_empty(), Duration::from_secs(10)).await;
    rt.queue.submit_query("avicii levels", viewer(2), Source::Chat, Some("p2"), None).await;
    rt.queue.submit_query("band five minutes", viewer(3), Source::Chat, Some("p3"), None).await;
    let before = rt.queue.store.get(&rt.queue.store.pending().into_iter().find(|r| r.requester.id == "twitch:2").unwrap().id).unwrap();
    let order_before: Vec<String> = rt.queue.store.pending().into_iter().map(|r| r.id).collect();

    // Erfolg: gleiche ID, gleicher Eingang, gleiche Reihenfolge, neuer Song.
    let flow = rt.queue.replace(&ch, &viewer(2), "hurt johnny cash", None).await;
    let after = match flow {
        ChatFlow::Replaced { request } => request,
        o => panic!("{o:?}"),
    };
    assert_eq!(after.id, before.id);
    assert_eq!(after.received_at, before.received_at);
    assert_eq!(after.position, before.position);
    assert_eq!(after.track.as_ref().unwrap().id, "c0000000000000000000hc");
    assert_eq!(after.rev, before.rev + 1);
    let order_after: Vec<String> = rt.queue.store.pending().into_iter().map(|r| r.id).collect();
    assert_eq!(order_before, order_after, "Platz bleibt erhalten");
    let msg = onair_core::twitch::commands::render_flow(&Settings::default().commands.replies, &ChatFlow::Replaced { request: after.clone() }, "viewer2").unwrap();
    assert!(msg.contains("Platz in der Warteschlange bleibt erhalten"), "{msg}");

    // Fehler: kein Treffer → alter Wunsch bleibt unverändert.
    let flow = rt.queue.replace(&ch, &viewer(2), "https://youtu.be/zzzzzzzzzzz", None).await;
    assert!(matches!(flow, ChatFlow::ReplaceFailed { .. }), "{flow:?}");
    let still = rt.queue.store.get(&before.id).unwrap();
    assert_eq!(still.track.as_ref().unwrap().id, "c0000000000000000000hc");
    assert_eq!(still.rev, after.rev);

    // Abbruch einer Versionsauswahl beim Austausch → alter Wunsch bleibt.
    yt(&h, "bbbbbbbbbbb", "Hurt", "Random Uploads");
    let flow = rt.queue.replace(&ch, &viewer(3), "https://youtu.be/bbbbbbbbbbb", None).await;
    assert!(matches!(flow, ChatFlow::Prompt { .. }), "{flow:?}");
    rt.queue.cancel_selection(&ch, &viewer(3)).await;
    let three = rt.queue.store.pending().into_iter().find(|r| r.requester.id == "twitch:3").unwrap();
    assert_eq!(three.track.as_ref().unwrap().id, "c0000000000000000000s5");

    // Bereits übergebener Wunsch: verständlicher Hinweis, keine Änderung.
    let flow = rt.queue.replace(&ch, &viewer(1), "avicii levels", None).await;
    assert!(matches!(flow, ChatFlow::Notice { notice: Notice::ReplaceLocked }), "{flow:?}");

}

// 5b) Rennen zwischen Austausch und Spotify-Übergabe: Spotify erhält genau einen Song – und zwar
// den, der danach am Request gespeichert ist. Mehrfach wiederholt.
#[tokio::test(start_paused = true)]
async fn replace_racing_the_handoff_never_sends_two_songs() {
    let h = Harness::new();
    catalog(&h);
    let mut s = settings();
    s.requests.handoff_ahead = 5;
    s.requests.allow_duplicates = true;
    let rt = start(&h, Db::in_memory().unwrap(), s).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    let mut outcomes = (0, 0);
    for round in 0..4u32 {
        let v = viewer(100 + round);
        let o = rt.queue.submit_query("band five minutes", v.clone(), Source::Chat, Some(&format!("race{round}")), None).await;
        let id = match &o {
            SubmitOutcome::Accepted { request, .. } => request.id.clone(),
            other => panic!("{other:?}"),
        };
        let q = rt.queue.clone();
        let (ch2, v2, id2) = (ch.clone(), v.clone(), id.clone());
        let q2 = rt.queue.clone();
        // Abwechselnd startet zuerst die Übergabe bzw. der Austausch.
        let (flow, _) = match round % 3 {
            0 => {
                let race = tokio::spawn(async move { q.replace(&ch2, &v2, "band six minutes", Some(&id2)).await });
                let hand = tokio::spawn(async move { q2.maybe_handoff().await });
                (race.await.unwrap(), hand.await.unwrap())
            }
            1 => {
                q2.maybe_handoff().await;
                (q.replace(&ch2, &v2, "band six minutes", Some(&id2)).await, ())
            }
            _ => {
                // Übergabe beginnt zuerst; der Austausch läuft an jeder Wartestelle dazwischen.
                let hand = tokio::spawn(async move { q2.maybe_handoff().await });
                let race = tokio::spawn(async move { q.replace(&ch2, &v2, "band six minutes", Some(&id2)).await });
                (race.await.unwrap(), hand.await.unwrap())
            }
        };
        rt.queue.maybe_handoff().await;
        wait_for("übergeben", || rt.queue.store.get(&id).unwrap().status == RequestStatus::HandedOff, Duration::from_secs(20)).await;
        let stored = rt.queue.store.get(&id).unwrap().track.unwrap().uri;
        match flow {
            ChatFlow::Replaced { .. } => {
                outcomes.0 += 1;
                assert!(stored.ends_with("s6"))
            }
            ChatFlow::Notice { notice: Notice::ReplaceLocked } => {
                outcomes.1 += 1;
                assert!(stored.ends_with("s5"))
            }
            other => panic!("{other:?}"),
        }
        let f = h.fake.lock().unwrap();
        let fives = f.queue.iter().filter(|u| u.ends_with("s5")).count();
        let sixes = f.queue.iter().filter(|u| u.ends_with("s6")).count();
        assert_eq!(fives + sixes, round as usize + 1, "genau ein Song pro Wunsch an Spotify");
        assert_eq!(f.queue.last(), Some(&stored), "an Spotify ging der gespeicherte Song");
        drop(f);
    }
    assert!(outcomes.0 > 0 && outcomes.1 > 0, "beide Ausgänge geprüft: {outcomes:?}");
}

// 6) Austausch behält die Kanalpunkte-Zuordnung; längere Ersatzsongs werden gegen das Zeitbudget
// geprüft, wobei die alte Dauer ersetzt (nicht zusätzlich gezählt) wird.
#[tokio::test(start_paused = true)]
async fn replace_keeps_redemption_and_respects_budget() {
    let h = Harness::new();
    catalog(&h);
    let mut s = settings();
    s.channel_points.enabled = true;
    let rt = start(&h, Db::in_memory().unwrap(), s).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    // Rest aktueller Titel 190 s; frei danach 420 s (7 min).
    let now = h.clock.now_ms();
    rt.plan_set_end(now + 190_000 + 420_000, Some(0)).unwrap();
    let o = rt.queue.submit_redemption("band five minutes", viewer(1), "reward-1", "red-1").await;
    let id = match &o {
        SubmitOutcome::Accepted { request, .. } => request.id.clone(),
        other => panic!("{other:?}"),
    };
    // 6 min passt nur, weil die 5 min des alten Songs frei werden.
    let flow = rt.queue.replace(&ch, &viewer(1), "band six minutes", None).await;
    let r = match flow {
        ChatFlow::Replaced { request } => request,
        other => panic!("{other:?}"),
    };
    assert_eq!(r.id, id);
    assert_eq!(r.source, Source::ChannelPoints);
    let red = r.redemption.clone().unwrap();
    assert_eq!(red.redemption_id, "red-1");
    assert_eq!(red.status, onair_core::queue::RedemptionStatus::Unfulfilled, "keine neue Einlösung, keine Abwicklung");
    assert_eq!(rt.queue.store.pending().len(), 1, "kein zweiter Platz verbraucht");
    // 9 min passen auch ohne alten Song nicht → abgelehnt, alter Wunsch bleibt.
    let flow = rt.queue.replace(&ch, &viewer(1), "band nine minutes", None).await;
    match flow {
        ChatFlow::ReplaceFailed { code, .. } => assert!(code == "too_long_for_plan" || code == "too_long", "{code}"),
        other => panic!("{other:?}"),
    }
    assert_eq!(rt.queue.store.get(&id).unwrap().track.unwrap().id, "c0000000000000000000s6");
}

// 7) Verlauf: alle vier Aliase, bis zu fünf tatsächlich gespielte, neueste zuerst; aktueller Song
// und reine Polling-Duplikate bleiben draußen; Neustart erzeugt keinen Doppeleintrag.
#[tokio::test(start_paused = true)]
async fn last_played_lists_observed_plays_only() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    let rt = start(&h, Db::open(&path).unwrap(), settings()).await;
    ready(&rt).await;
    let set = |n: u32| h.fake.lock().unwrap().current = Some(tid(n));
    for n in 1..=7 {
        set(n);
        // Mehrere Abfragen pro Titel (Polling), Pause/Weiter ändern nichts.
        tokio::time::sleep(Duration::from_secs(5)).await;
        if n == 3 {
            h.fake.lock().unwrap().is_playing = false;
            tokio::time::sleep(Duration::from_secs(5)).await;
            h.fake.lock().unwrap().is_playing = true;
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
    let last = rt.last_played(5);
    let ids: Vec<String> = last.iter().map(|e| e.track.id.clone()).collect();
    assert_eq!(ids, vec![tid(6), tid(5), tid(4), tid(3), tid(2)], "neueste zuerst, ohne aktuellen Titel");
    let msgs = onair_core::twitch::commands::last_songs_messages(&Settings::default().commands.replies, &last);
    assert!(!msgs.is_empty() && msgs.len() <= 3);
    assert!(msgs.iter().all(|m| m.chars().count() <= 480));
    assert!(msgs[0].starts_with("Zuletzt gespielt: 1) "), "{}", msgs[0]);
    assert!(msgs.concat().contains(&format!("https://open.spotify.com/track/{}", tid(6))));
    assert!(!msgs.concat().contains("Wunsch von"), "kein erfundener Requester");
    for alias in ["!letztersong", "!lastsong", "!letzter song", "!LAST  song"] {
        assert_eq!(onair_core::twitch::commands::parse(alias, &Settings::default().commands).map(|(k, _)| k), Some(onair_core::twitch::commands::CommandKind::LastSongs));
    }
    let count = rt.queue.store.history("", 100).len();
    rt.shutdown().await;
    drop(rt);
    // Neustart: derselbe Titel läuft noch → kein zweiter Eintrag, Session wird fortgesetzt.
    let rt = start(&h, Db::open(&path).unwrap(), settings()).await;
    ready(&rt).await;
    tokio::time::sleep(Duration::from_secs(5)).await;
    assert_eq!(rt.queue.store.history("", 100).len(), count);
    assert_eq!(rt.last_played(5).first().map(|e| e.track.id.clone()), Some(tid(6)));
}

fn playlist_tracks(n: usize) -> Vec<serde_json::Value> {
    (0..n).map(|i| cat(&format!("p{:021}", i), &format!("Playlist Song {i}"), "Band", 200)).collect()
}

// 8) Playlist: zunächst kein Request; erst die Auswahl übernimmt genau einen Titel. Große,
// geänderte und unzugängliche Playlists werden korrekt behandelt.
#[tokio::test(start_paused = true)]
async fn playlist_needs_explicit_single_choice() {
    let h = Harness::new();
    let pl = "37i9dQZF1DXcBWIGoYBM5M";
    h.fake.lock().unwrap().readable_playlists.insert(pl.into(), playlist_tracks(120));
    h.fake.lock().unwrap().playlist = Some(("Große Playlist".into(), Some(true)));
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    let o = rt.queue.submit_query(&format!("https://open.spotify.com/playlist/{pl}"), viewer(1), Source::Chat, Some("pl1"), None).await;
    let prompt = match &o {
        SubmitOutcome::NeedsChoice { prompt, .. } => prompt.clone(),
        other => panic!("{other:?}"),
    };
    assert_eq!(prompt.stage, Stage::Collection);
    assert_eq!(prompt.options.len(), 5);
    assert_eq!(prompt.pages, Some(24));
    assert!(rt.queue.store.pending().is_empty(), "noch kein Request in der Warteschlange");
    assert_eq!(h.count(onair_core::http::Method::Post, "/me/player/queue"), 0);
    // Blättern bis hinter die erste geladene Seite (50) lädt nach.
    for _ in 0..10 {
        rt.queue.page_step(&ch, &viewer(1), true).await;
    }
    let sel = rt.queue.selections.open_for(&ch, "twitch:1", h.clock.now_ms()).unwrap();
    assert_eq!(sel.data.page, 10);
    assert!(sel.data.loaded.len() >= 55, "{}", sel.data.loaded.len());
    // Playlist ändert sich: die gespeicherten IDs gelten weiter.
    h.fake.lock().unwrap().readable_playlists.insert(pl.into(), playlist_tracks(3));
    let flow = rt.queue.choose(&ch, &viewer(1), 3).await;
    match flow {
        ChatFlow::Outcome { outcome } => assert_eq!(accepted_track(&outcome), format!("p{:021}", 52)),
        other => panic!("{other:?}"),
    }
    assert_eq!(rt.queue.store.pending().len(), 1, "genau ein Titel übernommen");
    // Doppelte Bestätigung erzeugt keinen zweiten Request.
    assert!(matches!(rt.queue.choose(&ch, &viewer(1), 3).await, ChatFlow::Notice { notice: Notice::NoSelection }));
    assert_eq!(rt.queue.store.pending().len(), 1);
    // Unzugängliche Playlist (Development Mode: nicht eigene) → klarer Zustand.
    let o = rt.queue.submit_query("https://open.spotify.com/playlist/0000000000000000000000", viewer(2), Source::Chat, Some("pl2"), None).await;
    assert_eq!(code(&o), "source_not_accessible");
}

// 9) Vorprüfung verändert die Queue nicht; die endgültige Prüfung verhindert Rennen bei Duplikaten.
#[tokio::test(start_paused = true)]
async fn precheck_is_side_effect_free_and_final_check_prevents_races() {
    let h = Harness::new();
    catalog(&h);
    let mut s = settings();
    s.requests.max_duration_s = 360;
    let rt = start(&h, Db::in_memory().unwrap(), s).await;
    ready(&rt).await;
    let nine = match rt.queue.resolver.resolve("band nine minutes").await {
        onair_core::resolve::Resolution::Track { track, .. } => track,
        o => panic!("{o:?}"),
    };
    let v = rt.queue.precheck_track(&nine, &viewer(1), Source::Chat, None);
    assert!(!v.ok);
    assert_eq!(v.blocking.as_ref().unwrap().text, "Maximal 6 Minuten erlaubt");
    assert!(rt.queue.store.pending().is_empty(), "Vorprüfung reserviert nichts");
    assert_eq!(h.count(onair_core::http::Method::Post, "/me/player/queue"), 0);

    // Gleichzeitige Wünsche desselben Songs: nur einer wird angenommen.
    let futs: Vec<_> = (0..4)
        .map(|i| {
            let q = rt.queue.clone();
            tokio::spawn(async move { q.submit_query("avicii levels", viewer(10 + i), Source::Chat, Some(&format!("d{i}")), None).await })
        })
        .collect();
    let mut ok = 0;
    for f in futs {
        let o = f.await.unwrap();
        if matches!(o, SubmitOutcome::Accepted { .. }) {
            ok += 1;
        } else {
            assert_eq!(code(&o), "duplicate");
        }
    }
    assert_eq!(ok, 1);
    let lv = rt.queue.store.pending().into_iter().find(|r| r.track.as_ref().is_some_and(|t| t.id == "c0000000000000000000lv")).unwrap();
    let v = rt.queue.precheck_track(lv.track.as_ref().unwrap(), &viewer(30), Source::Chat, None);
    assert!(!v.ok);
    assert!(v.blocking.unwrap().text.starts_with("Bereits auf Platz"));
}

// 10) Wiederholte Nachrichten, abgelaufene Auswahlen, Neustart: keine unbeabsichtigten Songs.
#[tokio::test(start_paused = true)]
async fn repeats_expiry_and_restart_create_no_extra_songs() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    catalog(&h);
    yt(&h, "bbbbbbbbbbb", "Hurt", "Random Uploads");
    let rt = start(&h, Db::open(&path).unwrap(), settings()).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    // Dieselbe Chatnachricht zweimal → genau eine Verarbeitung.
    let a = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(1), Source::Chat, Some("same"), None).await;
    let b = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(1), Source::Chat, Some("same"), None).await;
    assert!(matches!(a, SubmitOutcome::NeedsChoice { .. }));
    assert!(matches!(b, SubmitOutcome::Duplicate));
    // Ablauf: Auswahl endet, Wunsch wird freigegeben, Bestätigung danach wirkungslos.
    tokio::time::sleep(Duration::from_secs(130)).await;
    rt.queue.sweep_selections().await;
    assert!(rt.queue.store.awaiting().is_empty());
    assert!(matches!(rt.queue.choose(&ch, &viewer(1), 1).await, ChatFlow::Notice { notice: Notice::NoSelection }));
    assert!(rt.queue.store.pending().is_empty());
    assert_eq!(rt.queue.store.recent_finished(5)[0].reason.as_deref(), Some("selection_expired"));
    // Neue Auswahl überlebt einen Neustart und lässt sich genau einmal bestätigen.
    let c = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(2), Source::Chat, Some("again"), None).await;
    assert!(matches!(c, SubmitOutcome::NeedsChoice { .. }));
    rt.shutdown().await;
    drop(rt);
    let rt = start(&h, Db::open(&path).unwrap(), settings()).await;
    ready(&rt).await;
    let ch = rt.queue.channel();
    assert_eq!(rt.queue.store.awaiting().len(), 1, "wartender Wunsch überlebt den Neustart");
    let v2 = viewer(2);
    let (x, y) = tokio::join!(rt.queue.choose(&ch, &v2, 2), rt.queue.choose(&ch, &v2, 2));
    let n_ok = [&x, &y].iter().filter(|f| matches!(f, ChatFlow::Outcome { .. })).count();
    assert_eq!(n_ok, 1, "{x:?} {y:?}");
    assert_eq!(rt.queue.store.pending().len(), 1);
    // Neue Auswahl ersetzt die alte ausdrücklich.
    let d1 = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(3), Source::Chat, Some("d1"), None).await;
    let d2 = rt.queue.submit_query("https://youtu.be/bbbbbbbbbbb", viewer(3), Source::Chat, Some("d2"), None).await;
    assert!(matches!(d1, SubmitOutcome::NeedsChoice { .. }) && matches!(d2, SubmitOutcome::NeedsChoice { .. }));
    assert_eq!(rt.queue.store.awaiting().len(), 1);
}

// Zusatz: Apple-Music-Albumlink mit ausgewähltem Song, SoundCloud über oEmbed, Kurzlink mit
// geprüfter Weiterleitung.
#[tokio::test(start_paused = true)]
async fn apple_soundcloud_and_short_links() {
    let h = Harness::new();
    catalog(&h);
    {
        let mut p = h.providers.lock().unwrap();
        p.itunes.insert("1440857795".into(), json!({"wrapperType": "track", "trackId": 1440857795u64, "trackName": "Levels", "artistName": "Avicii", "trackTimeMillis": 200_500, "trackExplicitness": "notExplicit"}));
        p.sc_oembed.insert("/some-user/hurt-cover".into(), ("Johnny Cash - Hurt".into(), "some-user".into()));
        p.short.insert("https://spotify.link/AbC123".into(), format!("https://open.spotify.com/track/{SP_ID}?si=x"));
        p.short.insert("https://spotify.link/Evil99".into(), "http://127.0.0.1:8080/admin".into());
    }
    let rt = start(&h, Db::in_memory().unwrap(), settings()).await;
    ready(&rt).await;
    let o = rt.queue.submit_query("https://music.apple.com/de/album/levels/1440857781?i=1440857795", viewer(1), Source::Chat, Some("a1"), None).await;
    assert_eq!(accepted_track(&o), "c0000000000000000000lv");
    let o = rt.queue.submit_query("https://soundcloud.com/some-user/hurt-cover?utm_source=x", viewer(2), Source::Chat, Some("a2"), None).await;
    assert_eq!(accepted_track(&o), "c0000000000000000000hc");
    let o = rt.queue.submit_query("https://spotify.link/AbC123", viewer(3), Source::Chat, Some("a3"), None).await;
    assert_eq!(accepted_track(&o), SP_ID);
    // Weiterleitung auf ein internes Ziel wird nicht verfolgt.
    let o = rt.queue.submit_query("https://spotify.link/Evil99", viewer(4), Source::Chat, Some("a4"), None).await;
    assert_eq!(code(&o), "unsupported_content");
    assert!(!h.providers.lock().unwrap().calls.iter().any(|c| c.contains("127.0.0.1")));
    h.providers.lock().unwrap().itunes_throttled = true;
    let o = rt.queue.submit_query("https://music.apple.com/us/song/x/999", viewer(5), Source::Chat, Some("a5"), None).await;
    assert_eq!(code(&o), "provider_rate_limited");
}
