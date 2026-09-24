//! Zugangsdaten im Betriebssystem-Tresor (Windows: Credential Manager).
//! Ein Eintrag pro Schlüssel; jeder Schreibvorgang ersetzt den Eintrag vollständig.

use onair_core::secrets::SecretStore;

const SERVICE: &str = "ON AIR";

pub struct KeyringStore;

impl SecretStore for KeyringStore {
    fn load(&self, key: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn save(&self, key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, key)
            .and_then(|e| e.set_password(value))
            .map_err(|e| e.to_string())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        match keyring::Entry::new(SERVICE, key).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
