//! Entwicklungswerkzeug: Startet den Overlay-Server mit festen Beispieldaten,
//! um die Widgets im Browser oder in OBS zu prüfen. Nicht Teil der App.
//!
//! cargo run -p onair-core --example overlay_demo -- 43899

use onair_core::overlay::{self, ControlAction, ControlHandler, NowPlaying, OverlayData, QueueItem};
use onair_core::settings::OverlaySettings;
use std::sync::Arc;

struct Noop;
impl ControlHandler for Noop {
    fn handle(&self, _a: ControlAction) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::args().nth(1).and_then(|p| p.parse().ok()).unwrap_or(43899);
    let now = || std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let mk = |t: &str, a: &str, r: &str| QueueItem { title: t.into(), artists: vec![a.into()], requester: r.into(), image_url: None };
    let data = OverlayData {
        status: "live",
        now: Some(NowPlaying {
            title: "Demo: Mitternachtslicht".into(),
            artists: vec!["Nordwind".into()],
            album: None,
            image_url: None,
            duration_ms: 214_000,
            progress_ms: 60_000,
            is_playing: true,
            fetched_at_ms: now(),
            requester: Some("nachteule_92".into()),
        }),
        queue: vec![mk("Glass Harbour", "Lena Holm", "Lumi"), mk("Low Tide", "Kairo Beach", "kalle"), mk("Sonnenkabel", "Frequenz 7", "Mara")],
        stale_after_ms: 3_600_000,
        styles: OverlaySettings::default(),
    };
    let (tx, rx) = tokio::sync::watch::channel(data);
    let srv = overlay::start(port, rx, String::new(), Arc::new(Noop)).await.expect("start");
    println!("Overlay-Demo auf http://127.0.0.1:{}/", srv.port);
    // Zeitstempel frisch halten, damit das Widget nicht ausblendet.
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
        tx.send_modify(|d| {
            if let Some(n) = d.now.as_mut() {
                n.progress_ms += 4000;
                n.fetched_at_ms = now();
            }
        });
    }
}
