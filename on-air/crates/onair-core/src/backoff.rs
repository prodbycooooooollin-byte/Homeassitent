//! Exponentielles Backoff mit Zufallsanteil und ein einfacher Circuit Breaker.

use rand::Rng;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Backoff {
    pub base: Duration,
    pub max: Duration,
    attempt: u32,
}

impl Backoff {
    pub fn new(base: Duration, max: Duration) -> Self {
        Self { base, max, attempt: 0 }
    }

    pub fn attempt(&self) -> u32 {
        self.attempt
    }

    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    /// Nächste Wartezeit: `min(max, base * 2^n)` mit „Full Jitter“ im Bereich [50 %, 100 %].
    pub fn next_delay(&mut self) -> Duration {
        let exp = self.attempt.min(16);
        self.attempt = self.attempt.saturating_add(1);
        let raw = self.base.saturating_mul(1u32 << exp).min(self.max);
        let ms = raw.as_millis() as u64;
        if ms == 0 {
            return raw;
        }
        let jittered = rand::rng().random_range(ms / 2..=ms);
        Duration::from_millis(jittered)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BreakerState {
    Closed,
    Open,
    HalfOpen,
}

/// Circuit Breaker: Nach `threshold` aufeinanderfolgenden Fehlern werden für
/// `cooldown` keine Anfragen gestellt; danach genau eine Probe (Half-Open).
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    threshold: u32,
    cooldown_ms: i64,
    failures: u32,
    opened_at_ms: Option<i64>,
    probing: bool,
}

impl CircuitBreaker {
    pub fn new(threshold: u32, cooldown: Duration) -> Self {
        Self {
            threshold,
            cooldown_ms: cooldown.as_millis() as i64,
            failures: 0,
            opened_at_ms: None,
            probing: false,
        }
    }

    pub fn state(&self, now_ms: i64) -> BreakerState {
        match self.opened_at_ms {
            None => BreakerState::Closed,
            Some(at) if now_ms - at >= self.cooldown_ms => BreakerState::HalfOpen,
            Some(_) => BreakerState::Open,
        }
    }

    /// Darf jetzt eine Anfrage gestellt werden?
    pub fn allow(&mut self, now_ms: i64) -> bool {
        match self.state(now_ms) {
            BreakerState::Closed => true,
            BreakerState::Open => false,
            BreakerState::HalfOpen => {
                if self.probing {
                    false
                } else {
                    self.probing = true;
                    true
                }
            }
        }
    }

    pub fn on_success(&mut self) {
        self.failures = 0;
        self.opened_at_ms = None;
        self.probing = false;
    }

    pub fn on_failure(&mut self, now_ms: i64) {
        self.failures = self.failures.saturating_add(1);
        if self.probing || self.failures >= self.threshold {
            self.opened_at_ms = Some(now_ms);
        }
        self.probing = false;
    }

    pub fn consecutive_failures(&self) -> u32 {
        self.failures
    }

    /// Verbleibende Zeit bis zur nächsten erlaubten Probe.
    pub fn remaining_ms(&self, now_ms: i64) -> i64 {
        match self.opened_at_ms {
            Some(at) => (self.cooldown_ms - (now_ms - at)).max(0),
            None => 0,
        }
    }

    /// Gezielte Wiederherstellung (z. B. „Verbindung prüfen“ oder Netz wieder da).
    pub fn force_half_open(&mut self) {
        if self.opened_at_ms.is_some() {
            self.opened_at_ms = Some(i64::MIN / 2);
            self.probing = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_and_is_capped() {
        let mut b = Backoff::new(Duration::from_millis(500), Duration::from_secs(10));
        let mut last_cap = 0;
        for i in 0..10 {
            let d = b.next_delay().as_millis() as u64;
            let cap = (500u64 << i.min(16)).min(10_000);
            assert!(d <= cap && d >= cap / 2, "attempt {i}: {d} not in [{}, {cap}]", cap / 2);
            assert!(cap >= last_cap);
            last_cap = cap;
        }
    }

    #[test]
    fn breaker_opens_and_probes_once() {
        let mut cb = CircuitBreaker::new(3, Duration::from_secs(30));
        for _ in 0..3 {
            assert!(cb.allow(0));
            cb.on_failure(0);
        }
        assert_eq!(cb.state(1_000), BreakerState::Open);
        assert!(!cb.allow(1_000));
        assert!(cb.allow(31_000), "half-open probe");
        assert!(!cb.allow(31_001), "only one probe");
        cb.on_failure(31_002);
        assert_eq!(cb.state(31_003), BreakerState::Open);
        assert!(cb.allow(62_000));
        cb.on_success();
        assert_eq!(cb.state(62_001), BreakerState::Closed);
    }
}
