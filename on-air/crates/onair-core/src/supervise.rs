//! Absturzsicherung für Hintergrundaufgaben.
//!
//! Stürzt ein Arbeits-Task durch einen Programmfehler (Panic) ab, bliebe seine zuletzt
//! veröffentlichte Anzeige stehen: Die Oberfläche zeigt „verbunden“, aber nichts wird mehr
//! verarbeitet. Stattdessen wird der Fehler im Aktivitätsprotokoll sichtbar gemacht und die
//! Aufgabe nach kurzer Pause neu gestartet.

use crate::activity::ActivityLog;
use futures_util::FutureExt;
use serde_json::json;
use std::any::Any;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::Instant;

/// Meldet einen Absturz: (Name der Aufgabe, Anzahl in Folge, Beschreibung).
pub type CrashSink = Arc<dyn Fn(&str, u32, String) + Send + Sync>;

/// Absturzmeldung im Aktivitätsprotokoll (sichtbar in der App).
pub fn activity_sink(activity: ActivityLog) -> CrashSink {
    Arc::new(move |name, count, detail| {
        tracing::error!(target: "supervise", name, count, detail, "Aufgabe abgestürzt");
        activity.error(
            "worker.crashed",
            format!("Interner Fehler in „{name}“ – die Aufgabe wird neu gestartet"),
            json!({ "worker": name, "count": count, "detail": detail }),
        );
    })
}

pub fn panic_text(p: &(dyn Any + Send)) -> String {
    if let Some(s) = p.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = p.downcast_ref::<String>() {
        s.clone()
    } else {
        "unbekannter Fehler".into()
    }
}

/// Wartezeit vor dem Neustart: 1 s, 2 s, 4 s … höchstens 60 s.
pub fn restart_delay(crashes: u32) -> Duration {
    Duration::from_secs((1u64 << crashes.saturating_sub(1).min(6)).min(60))
}

/// Läuft die Aufgabe so lange stabil, zählen frühere Abstürze nicht mehr.
const STABLE_AFTER: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct Restarts {
    count: u32,
}

impl Restarts {
    /// Nach einem Absturz: melden und warten, bevor der Aufrufer neu startet.
    pub async fn after_panic(&mut self, name: &str, sink: &CrashSink, started: Instant, p: Box<dyn Any + Send>) {
        if started.elapsed() >= STABLE_AFTER {
            self.count = 0;
        }
        self.count += 1;
        sink(name, self.count, panic_text(&*p));
        tokio::time::sleep(restart_delay(self.count)).await;
    }
}

/// Führt `make()` aus; stürzt es ab, wird es nach kurzer Pause neu erzeugt und gestartet.
/// Endet es normal, endet auch diese Funktion.
pub async fn keep_alive<F, Fut>(name: &'static str, sink: CrashSink, mut make: F)
where
    F: FnMut() -> Fut,
    Fut: Future<Output = ()>,
{
    let mut restarts = Restarts::default();
    loop {
        let started = Instant::now();
        match AssertUnwindSafe(make()).catch_unwind().await {
            Ok(()) => return,
            Err(p) => restarts.after_panic(name, &sink, started, p).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering::SeqCst};

    #[tokio::test(start_paused = true)]
    async fn restarts_after_panic_and_reports_each_crash() {
        let runs = Arc::new(AtomicU32::new(0));
        let reports = Arc::new(std::sync::Mutex::new(Vec::<(String, u32, String)>::new()));
        let r2 = reports.clone();
        let sink: CrashSink = Arc::new(move |n, c, d| r2.lock().unwrap().push((n.to_string(), c, d)));
        let r = runs.clone();
        keep_alive("test", sink, move || {
            let r = r.clone();
            async move {
                if r.fetch_add(1, SeqCst) < 2 {
                    panic!("kaputt {}", r.load(SeqCst));
                }
            }
        })
        .await;
        assert_eq!(runs.load(SeqCst), 3, "zweimal abgestürzt, beim dritten Mal fertig");
        let got = reports.lock().unwrap().clone();
        assert_eq!(got.len(), 2);
        assert_eq!((got[0].0.as_str(), got[0].1, got[0].2.as_str()), ("test", 1, "kaputt 1"));
        assert_eq!(got[1].1, 2);
    }

    #[test]
    fn delay_grows_and_is_capped() {
        let d: Vec<u64> = (1..=9).map(|n| restart_delay(n).as_secs()).collect();
        assert_eq!(d, vec![1, 2, 4, 8, 16, 32, 60, 60, 60]);
    }
}
