//! Erkennung von Standby/Aufwachen über Sprünge der Wanduhr.
//!
//! Läuft ein Intervall von 5 s, zeigt die Wanduhr danach aber deutlich mehr
//! vergangene Zeit, war das System (wahrscheinlich) im Standby. Dann werden die
//! Dienste gezielt geprüft – ohne neue Worker zu starten.

use crate::clock::SharedClock;
use std::time::Duration;

pub const TICK: Duration = Duration::from_secs(5);
pub const JUMP_THRESHOLD_MS: i64 = 20_000;

/// Reine Entscheidungsfunktion (testbar).
pub fn is_wake_jump(prev_wall_ms: i64, now_wall_ms: i64, expected_ms: i64) -> bool {
    now_wall_ms - prev_wall_ms - expected_ms > JUMP_THRESHOLD_MS
}

pub async fn watch(clock: SharedClock, on_wake: impl Fn(i64) + Send + 'static) {
    let mut prev = clock.now_ms();
    let mut interval = tokio::time::interval(TICK);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    interval.tick().await;
    loop {
        interval.tick().await;
        let now = clock.now_ms();
        if is_wake_jump(prev, now, TICK.as_millis() as i64) {
            on_wake(now - prev);
        }
        prev = now;
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn detects_jumps() {
        assert!(!super::is_wake_jump(0, 5_000, 5_000));
        assert!(!super::is_wake_jump(0, 15_000, 5_000));
        assert!(super::is_wake_jump(0, 600_000, 5_000));
    }
}
