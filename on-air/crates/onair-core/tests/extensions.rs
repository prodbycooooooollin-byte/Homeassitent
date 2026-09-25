//! Tests der Erweiterungen: Request-Quellen, Kanalpunkte, Streamplanung, Update-Pause.
//! SIMULIERT gegen Fake-Spotify und Fake-Twitch – keine echten Dienste.

mod common;

use common::*;
use onair_core::acceptance::Block;
use onair_core::http::Method;
use onair_core::queue::{RedemptionStatus, RequestStatus, Requester, Source, SubmitOutcome};
use onair_core::runtime::{Endpoints, Runtime, RuntimeConfig, SPOTIFY_SECRET_KEY};
use onair_core::settings::{Role, Settings};
use onair_core::storage::Db;
use onair_core::twitch::helix::RedemptionInfo;
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

fn settings(chat: bool, cp: bool) -> Settings {
    let mut s = Settings::default();
    s.spotify.client_id = "client".into();
    s.twitch.client_id = "c".into();
    s.requests.open = true;
    s.requests.chat_enabled = chat;
    s.requests.user_cooldown_s = 0;
    s.requests.per_user_limit = 20;
    s.channel_points.enabled = cp;
    s
}

async fn start(h: &Harness, db: Db, s: Settings) -> Arc<Runtime> {
    s.save(&db).unwrap();
    let _ = h.tokens(SPOTIFY_SECRET_KEY, 3_600_000);
    h.twitch_tokens();
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
    wait_for("Twitch-Identität", || rt.twitch_state.borrow().identity.is_some(), Duration::from_secs(15)).await;
}

async fn reward_ready(rt: &Runtime) -> String {
    wait_for(
        "Belohnung abgeglichen",
        || {
            let s = rt.channel_points.status();
            s.reward_id.is_some() && s.reconciled && s.in_sync
        },
        Duration::from_secs(30),
    )
    .await;
    rt.channel_points.status().reward_id.unwrap()
}

fn viewer(n: u32) -> Requester {
    Requester { id: format!("twitch:{n}"), name: format!("viewer{n}"), role: Role::Everyone }
}

fn red(id: &str, reward: &str, user: &str, input: &str) -> RedemptionInfo {
    RedemptionInfo {
        id: id.into(),
        reward_id: reward.into(),
        user_id: user.into(),
        user_login: format!("u{user}"),
        user_name: format!("User{user}"),
        user_input: input.into(),
        status: "UNFULFILLED".into(),
    }
}

fn accepted(o: &SubmitOutcome) -> bool {
    matches!(o, SubmitOutcome::Accepted { .. } | SubmitOutcome::PendingReview { .. })
}

fn rejected_code(o: &SubmitOutcome) -> String {
    match o {
        SubmitOutcome::Rejected { code, .. } => code.clone(),
        other => format!("{other:?}"),
    }
}

// Quellen: alle vier Kombinationen und die globale Pause.
#[tokio::test(start_paused = true)]
async fn four_source_combinations_and_global_pause() {
    for (chat, cp) in [(true, false), (false, true), (true, true), (false, false)] {
        let h = Harness::new();
        let rt = start(&h, Db::in_memory().unwrap(), settings(chat, cp)).await;
        ready(&rt).await;
        let reward = if cp { reward_ready(&rt).await } else { "rw-x".into() };
        let c = rt.queue.submit_query("chat song", viewer(1), Source::Chat, Some("e1"), None).await;
        let p = rt.queue.submit_redemption("points song", viewer(2), &reward, "red-1").await;
        assert_eq!(accepted(&c), chat, "chat={chat} cp={cp}: {c:?}");
        assert_eq!(accepted(&p), cp, "chat={chat} cp={cp}: {p:?}");
        if !chat {
            assert_eq!(rejected_code(&c), "source_disabled");
        }
        if !cp {
            assert_eq!(rejected_code(&p), "source_disabled");
        }
        // Globale Pause überlagert, ohne die Konfiguration zu ändern.
        rt.set_requests_open(false).await.unwrap();
        let c2 = rt.queue.submit_query("chat song 2", viewer(3), Source::Chat, Some("e2"), None).await;
        let p2 = rt.queue.submit_redemption("points song 2", viewer(4), &reward, "red-2").await;
        assert!(!accepted(&c2) && !accepted(&p2));
        let s = onair_core::settings::read(&rt.settings).clone();
        assert_eq!((s.requests.chat_enabled, s.channel_points.enabled), (chat, cp));
        let a = rt.acceptance();
        if chat {
            assert_eq!(a.chat.blocks, vec![Block::ManualPause]);
        }
        rt.shutdown().await;
    }
}

// Belohnung: Einschalten erzeugt keine Duplikate – auch nicht nach Neustart oder Absturz.
#[tokio::test(start_paused = true)]
async fn reward_is_created_once_and_adopted_after_crash() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    let rt = start(&h, Db::open(&path).unwrap(), settings(true, true)).await;
    ready(&rt).await;
    let id1 = reward_ready(&rt).await;
    rt.shutdown().await;
    drop(rt);
    let rt = start(&h, Db::open(&path).unwrap(), settings(true, true)).await;
    ready(&rt).await;
    let id2 = reward_ready(&rt).await;
    assert_eq!(id1, id2);
    assert_eq!(h.twitch.lock().unwrap().creates, 1, "kein zweites Anlegen nach Neustart");
    rt.shutdown().await;

    // Absturz zwischen Anlegen auf Twitch und lokalem Speichern: neue DB ohne ID.
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, true)).await;
    ready(&rt).await;
    assert_eq!(reward_ready(&rt).await, id1, "vorhandene eigene Belohnung übernommen");
    assert_eq!(h.twitch.lock().unwrap().creates, 1);
    rt.shutdown().await;

    // Fremde Belohnung mit gleichem Titel: nicht verwaltbar → verständlicher Fehler, kein Duplikat.
    let h = Harness::new();
    h.twitch.lock().unwrap().rewards.push(("foreign".into(), serde_json::json!({"id": "foreign", "title": "Song wünschen"}), false));
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, true)).await;
    ready(&rt).await;
    wait_for("Fehler", || rt.channel_points.status().last_error.is_some(), Duration::from_secs(20)).await;
    assert_eq!(rt.channel_points.status().last_error.unwrap().code, "reward_title_taken");
    assert_eq!(h.twitch.lock().unwrap().creates, 0);
    assert!(!rt.acceptance().channel_points.open);
    rt.shutdown().await;
}

// Ausschalten: Remote-Zustand erst nach Bestätigung; Belohnung wird deaktiviert, nicht gelöscht.
#[tokio::test(start_paused = true)]
async fn disabling_shows_pending_until_twitch_confirms() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, true)).await;
    ready(&rt).await;
    let id = reward_ready(&rt).await;
    h.twitch.lock().unwrap().fail_patch = true;
    let mut s = onair_core::settings::read(&rt.settings).clone();
    s.channel_points.enabled = false;
    rt.update_settings(s).await.unwrap();
    rt.channel_points.kick();
    tokio::time::sleep(Duration::from_secs(3)).await;
    let st = rt.channel_points.status();
    assert!(!st.desired_enabled);
    assert_eq!(st.confirmed_enabled, Some(true), "noch nicht bestätigt");
    assert!(!st.in_sync, "UI zeigt „Deaktivierung auf Twitch noch ausstehend“");
    h.twitch.lock().unwrap().fail_patch = false;
    rt.channel_points.kick();
    wait_for("deaktiviert", || rt.channel_points.status().confirmed_enabled == Some(false), Duration::from_secs(400)).await;
    let tw = h.twitch.lock().unwrap();
    let r = tw.rewards.iter().find(|(i, _, _)| *i == id).expect("nicht gelöscht");
    assert_eq!(r.1["is_enabled"], serde_json::json!(false));
}

// Einlösungen: doppelte Events → ein Wunsch; Erfüllen erst nach Wiedergabebeginn; Ablehnung storniert.
#[tokio::test(start_paused = true)]
async fn redemptions_are_deduplicated_and_settled() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, true)).await;
    ready(&rt).await;
    let reward = reward_ready(&rt).await;
    h.twitch.lock().unwrap().add_redemption("red-a", &reward, "7", "good song");
    let ev = red("red-a", &reward, "7", "good song");
    rt.channel_points.on_add(ev.clone()).await;
    rt.channel_points.on_add(ev).await; // doppelte Zustellung
    let mine: Vec<_> = rt.queue.store.pending().into_iter().filter(|r| r.source == Source::ChannelPoints).collect();
    assert_eq!(mine.len(), 1, "genau ein Wunsch");
    let rid = mine[0].id.clone();
    // Übergeben, aber noch nicht gespielt → noch nicht erfüllt.
    wait_for("übergeben", || rt.queue.store.get(&rid).map(|r| r.status == RequestStatus::HandedOff).unwrap_or(false), Duration::from_secs(20)).await;
    rt.channel_points.kick();
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert_eq!(h.twitch.lock().unwrap().redemption_status("red-a").as_deref(), Some("UNFULFILLED"));
    h.fake.lock().unwrap().advance();
    wait_for("erfüllt", || h.twitch.lock().unwrap().redemption_status("red-a").as_deref() == Some("FULFILLED"), Duration::from_secs(60)).await;
    wait_for("lokal bestätigt", || rt.queue.store.get(&rid).and_then(|r| r.redemption).map(|x| x.status) == Some(RedemptionStatus::Fulfilled), Duration::from_secs(10)).await;

    // Ungültiger Wunsch → storniert (Punkte erstattet) – aber erst nach bestätigter Antwort.
    h.twitch.lock().unwrap().fail_patch = true;
    h.twitch.lock().unwrap().add_redemption("red-b", &reward, "8", "https://youtube.com/watch?v=x");
    rt.channel_points.on_add(red("red-b", &reward, "8", "https://youtube.com/watch?v=x")).await;
    let b = rt.queue.store.by_redemption("red-b").unwrap();
    assert_eq!(b.status, RequestStatus::Rejected);
    rt.channel_points.kick();
    tokio::time::sleep(Duration::from_secs(3)).await;
    assert_eq!(rt.queue.store.by_redemption("red-b").unwrap().redemption.unwrap().status, RedemptionStatus::Unfulfilled, "nicht voreilig als erstattet anzeigen");
    h.twitch.lock().unwrap().fail_patch = false;
    rt.channel_points.kick();
    wait_for("storniert", || h.twitch.lock().unwrap().redemption_status("red-b").as_deref() == Some("CANCELED"), Duration::from_secs(400)).await;
    wait_for("lokal", || rt.queue.store.by_redemption("red-b").unwrap().redemption.unwrap().status == RedemptionStatus::Canceled, Duration::from_secs(10)).await;
    let patches = h.twitch.lock().unwrap().redemption_patches.iter().filter(|(i, _)| i == "red-b").count();
    assert_eq!(patches, 1, "genau eine erfolgreiche Abwicklung");
}

// Unterbrechung: Neustart verliert keine Zuordnung; verpasste Einlösungen werden übernommen.
#[tokio::test(start_paused = true)]
async fn restart_recovers_pending_redemptions() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    let reward;
    {
        let rt = start(&h, Db::open(&path).unwrap(), settings(true, true)).await;
        ready(&rt).await;
        reward = reward_ready(&rt).await;
        // Abgelehnt, aber Twitch-Abwicklung scheitert vor dem Beenden.
        h.twitch.lock().unwrap().fail_patch = true;
        h.twitch.lock().unwrap().add_redemption("red-x", &reward, "9", "");
        rt.channel_points.on_add(red("red-x", &reward, "9", "")).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
        rt.shutdown().await;
    }
    // Während die App aus war, wurde eine weitere Belohnung eingelöst.
    h.twitch.lock().unwrap().add_redemption("red-y", &reward, "10", "late song");
    h.twitch.lock().unwrap().fail_patch = false;
    let rt = start(&h, Db::open(&path).unwrap(), settings(true, true)).await;
    ready(&rt).await;
    // Bis zum Abgleich keine neuen Kanalpunkte-Wünsche.
    assert!(rt.acceptance().channel_points.blocks.iter().any(|b| matches!(b, Block::Reconciling)) || rt.channel_points.is_reconciled());
    reward_ready(&rt).await;
    wait_for("verpasste Einlösung übernommen", || rt.queue.store.by_redemption("red-y").is_some(), Duration::from_secs(20)).await;
    wait_for("Abwicklung nachgeholt", || h.twitch.lock().unwrap().redemption_status("red-x").as_deref() == Some("CANCELED"), Duration::from_secs(60)).await;
    let y = rt.queue.store.by_redemption("red-y").unwrap();
    assert!(y.status.is_pending() || y.status == RequestStatus::Playing, "{:?} {:?} {:?}", y.status, y.reason, y.reason_text);
}

// Zeitbudget: zwei gleichzeitige Wünsche können denselben Restplatz nicht beide beanspruchen.
#[tokio::test(start_paused = true)]
async fn concurrent_requests_cannot_share_the_same_budget() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, false)).await;
    ready(&rt).await;
    // Aktueller Titel: 200 s, Fortschritt 10 s → 190 s Rest. Frei: 250 s, Suchtreffer je 200 s.
    let now = h.clock.now_ms();
    rt.plan_set_end(now + 190_000 + 250_000, Some(0)).unwrap();
    let futs: Vec<_> = (0..2)
        .map(|i| {
            let q = rt.queue.clone();
            tokio::spawn(async move { q.submit_query(&format!("parallel {i}"), viewer(20 + i), Source::Chat, Some(&format!("p{i}")), None).await })
        })
        .collect();
    let mut ok = 0;
    let mut codes = vec![];
    for f in futs {
        let o = f.await.unwrap();
        if accepted(&o) {
            ok += 1;
        } else {
            codes.push(rejected_code(&o));
        }
    }
    assert_eq!(ok, 1, "{codes:?}");
    assert!(codes[0] == "too_long_for_plan" || codes[0] == "budget_exhausted");
}

// Ablehnung nennt Songlänge und Restzeit.
#[tokio::test(start_paused = true)]
async fn too_long_request_gets_concrete_reason() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, false)).await;
    ready(&rt).await;
    let now = h.clock.now_ms();
    rt.plan_set_end(now + 190_000 + 150_000, Some(0)).unwrap();
    let o = rt.queue.submit_query("long one", viewer(1), Source::Chat, Some("l1"), None).await;
    match o {
        SubmitOutcome::Rejected { code, text, .. } => {
            assert_eq!(code, "too_long_for_plan");
            assert!(text.contains("dauert 3:20") && text.contains("noch 2:30"), "{text}");
        }
        other => panic!("{other:?}"),
    }
    // Ein zu langer Titel schließt die Annahme nicht insgesamt.
    assert!(rt.acceptance().chat.open);
}

// Sperrgründe: +15 Minuten hebt keine manuelle Pause auf; Neustart setzt die Endzeit nicht zurück.
#[tokio::test(start_paused = true)]
async fn extension_keeps_manual_pause_and_restart_keeps_end() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onair.db");
    let h = Harness::new();
    let end;
    {
        let rt = start(&h, Db::open(&path).unwrap(), settings(true, false)).await;
        ready(&rt).await;
        end = h.clock.now_ms() + 5 * 60_000;
        rt.plan_set_end(end, Some(120_000)).unwrap();
        rt.set_requests_open(false).await.unwrap();
        rt.plan_extend(15).unwrap();
        let a = rt.acceptance();
        assert!(a.chat.blocks.contains(&Block::ManualPause), "manuelle Pause bleibt");
        assert!(!a.chat.open);
        assert_eq!(rt.queue.plan_config().end_at_ms, Some(end + 15 * 60_000));
        rt.shutdown().await;
    }
    tokio::time::sleep(Duration::from_secs(60)).await;
    let mut s = settings(true, false);
    s.requests.open = false;
    let rt = start(&h, Db::open(&path).unwrap(), s).await;
    assert_eq!(rt.queue.plan_config().end_at_ms, Some(end + 15 * 60_000), "fester Endzeitpunkt, kein erneutes „noch 20 Minuten“");
    rt.set_requests_open(true).await.unwrap();
    // Session läuft ab und bleibt nach Neustart geschlossen.
    tokio::time::sleep(Duration::from_secs(25 * 60)).await;
    assert!(rt.queue.plan_status().ended);
    rt.shutdown().await;
    drop(rt);
    let rt = start(&h, Db::open(&path).unwrap(), settings(true, false)).await;
    ready(&rt).await;
    assert!(rt.acceptance().chat.blocks.contains(&Block::StreamEnded));
    let o = rt.queue.submit_query("after end", viewer(3), Source::Chat, Some("x1"), None).await;
    assert_eq!(rejected_code(&o), "stream_ended");
    // Verlängerung hebt die reine Zeitsperre wieder auf.
    rt.plan_extend(30).unwrap();
    assert!(rt.acceptance().chat.open);
}

// Prognose: Pause verbraucht Streamzeit, Skip/Seek werden über den synchronisierten Zustand berücksichtigt.
#[tokio::test(start_paused = true)]
async fn plan_follows_pause_skip_and_seek() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, false)).await;
    ready(&rt).await;
    let now = h.clock.now_ms();
    rt.plan_set_end(now + 30 * 60_000, Some(120_000)).unwrap();
    let s0 = rt.queue.plan_status();
    // Pause: Restlaufzeit bleibt, Zeit vergeht → Budget sinkt um die Pausendauer.
    h.fake.lock().unwrap().is_playing = false;
    tokio::time::sleep(Duration::from_secs(10)).await;
    let a = rt.queue.plan_status();
    tokio::time::sleep(Duration::from_secs(120)).await;
    let b = rt.queue.plan_status();
    assert!((a.free_ms - b.free_ms - 120_000).abs() < 1_000, "{} {}", a.free_ms, b.free_ms);
    assert_eq!(a.current_remaining_ms, b.current_remaining_ms);
    assert!(b.uncertain.contains(&"paused".to_string()));
    // Seek nach vorn → mehr Budget; Skip → neuer Titel mit voller Dauer.
    {
        let mut f = h.fake.lock().unwrap();
        f.is_playing = true;
        f.progress_ms = 190_000;
    }
    tokio::time::sleep(Duration::from_secs(10)).await;
    let c = rt.queue.plan_status();
    assert!(c.current_remaining_ms <= 10_000, "{}", c.current_remaining_ms);
    h.fake.lock().unwrap().advance();
    tokio::time::sleep(Duration::from_secs(10)).await;
    let d = rt.queue.plan_status();
    assert!(d.current_remaining_ms > 150_000);
    assert!(s0.free_ms > d.free_ms);
    let _ = h.count(Method::Get, "/me/player");
}

// Update-Pause: Annahme und Belohnung pausiert; Abbruch stellt den vorherigen Zustand her.
#[tokio::test(start_paused = true)]
async fn update_preparation_pauses_and_can_be_cancelled() {
    let h = Harness::new();
    let rt = start(&h, Db::in_memory().unwrap(), settings(true, true)).await;
    ready(&rt).await;
    reward_ready(&rt).await;
    let prep = rt.prepare_for_update().await;
    assert_eq!(prep.reward_paused, Some(true));
    assert!(prep.queue_idle && prep.db_saved);
    let o = rt.queue.submit_query("during update", viewer(1), Source::Chat, Some("u1"), None).await;
    assert_eq!(rejected_code(&o), "update_pause");
    rt.cancel_update_pause();
    let o = rt.queue.submit_query("after cancel", viewer(1), Source::Chat, Some("u2"), None).await;
    assert!(accepted(&o), "{o:?}");
    rt.channel_points.kick();
    wait_for("wieder aktiv", || rt.channel_points.status().confirmed_paused == Some(false), Duration::from_secs(60)).await;
}
