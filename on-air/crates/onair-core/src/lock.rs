//! Mutex-Zugriff, der nach einem Panic eines anderen Threads weiterläuft.
//!
//! Ein vergifteter `std::sync::Mutex` (ein Thread ist mit gehaltener Sperre abgestürzt) würde mit
//! `lock().unwrap()` jeden späteren Zugriff ebenfalls abstürzen lassen: Verbindungen bleiben
//! „grün“, aber nichts wird mehr verarbeitet. Die geschützten Daten bleiben hier benutzbar – die
//! Werte sind einfache Zustände ohne Invarianten über mehrere Felder.

use std::sync::{Mutex, MutexGuard};

pub trait LockExt<T> {
    fn lock_safe(&self) -> MutexGuard<'_, T>;
}

impl<T> LockExt<T> for Mutex<T> {
    fn lock_safe(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|p| p.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn poisoned_mutex_stays_usable() {
        let m = Arc::new(Mutex::new(1));
        let m2 = m.clone();
        let _ = std::thread::spawn(move || {
            let _g = m2.lock().unwrap();
            panic!("absichtlich");
        })
        .join();
        assert!(m.lock().is_err(), "vergiftet");
        *m.lock_safe() += 1;
        assert_eq!(*m.lock_safe(), 2);
    }
}
