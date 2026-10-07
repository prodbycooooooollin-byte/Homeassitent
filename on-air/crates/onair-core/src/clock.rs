use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

/// Wanduhr in Millisekunden seit Unix-Epoche. Abstrahiert, damit Tests Ablaufzeiten
/// und Standby-Sprünge deterministisch simulieren können.
pub trait Clock: Send + Sync + 'static {
    fn now_ms(&self) -> i64;
}

#[derive(Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}

/// Manuell steuerbare Uhr für Tests.
#[derive(Debug, Clone, Default)]
pub struct FakeClock(Arc<AtomicI64>);

impl FakeClock {
    pub fn new(start_ms: i64) -> Self {
        Self(Arc::new(AtomicI64::new(start_ms)))
    }
    pub fn advance_ms(&self, ms: i64) {
        self.0.fetch_add(ms, Ordering::SeqCst);
    }
    pub fn set_ms(&self, ms: i64) {
        self.0.store(ms, Ordering::SeqCst);
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

pub type SharedClock = Arc<dyn Clock>;
