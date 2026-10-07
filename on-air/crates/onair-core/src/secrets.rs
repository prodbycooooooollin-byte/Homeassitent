//! Ablage für Zugangsdaten. In der Desktop-App: Windows Credential Manager
//! (siehe `src-tauri/src/keyring_store.rs`). Secrets landen nie in SQLite,
//! LocalStorage, Exportdateien oder Logs.

use std::collections::HashMap;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync + 'static {
    fn load(&self, key: &str) -> Result<Option<String>, String>;
    /// Ersetzt den Eintrag vollständig (ein Eintrag = ein atomarer Schreibvorgang).
    fn save(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}

/// Flüchtiger Speicher für Tests.
#[derive(Default)]
pub struct MemorySecretStore {
    map: Mutex<HashMap<String, String>>,
    pub fail_writes: std::sync::atomic::AtomicBool,
}

impl SecretStore for MemorySecretStore {
    fn load(&self, key: &str) -> Result<Option<String>, String> {
        Ok(self.map.lock().unwrap().get(key).cloned())
    }
    fn save(&self, key: &str, value: &str) -> Result<(), String> {
        if self.fail_writes.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("simulierter Schreibfehler".into());
        }
        self.map.lock().unwrap().insert(key.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, key: &str) -> Result<(), String> {
        self.map.lock().unwrap().remove(key);
        Ok(())
    }
}
