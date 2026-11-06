//! Token-Verwaltung mit Single-Flight-Refresh und Sitzungs-Epoche.
//!
//! Garantien:
//! - Gleichzeitige Aufrufer teilen sich genau einen laufenden Refresh (async Mutex +
//!   erneute Prüfung nach dem Warten).
//! - Ein neuer Refresh Token wird gespeichert, bevor er im Speicher aktiv wird;
//!   fehlt er in der Antwort, bleibt der bisherige erhalten.
//! - Netzfehler beim Refresh löschen keine Zugangsdaten. Nur ein bestätigtes
//!   `invalid_grant` (bzw. widerrufene Autorisierung) führt zur Loginaufforderung.
//! - Abmelden erhöht die Epoche; verspätete Antworten älterer Epochen werden verworfen.

use crate::lock::LockExt;
use crate::clock::SharedClock;
use crate::error::ApiError;
use crate::secrets::SecretStore;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Aus `expires_in` der Antwort berechnet – keine unbegrenzte Gültigkeit unterstellt.
    pub expires_at_ms: i64,
    pub scope: String,
    /// Zeitpunkt der ursprünglichen Autorisierung (Spotify: Refresh-Token-Laufzeit zählt ab hier).
    pub authorized_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in_s: u64,
    pub scope: Option<String>,
}

#[async_trait]
pub trait TokenEndpoint: Send + Sync + 'static {
    /// Muss `ApiError::ReauthRequired` nur bei bestätigt ungültigem Refresh Token liefern.
    async fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, ApiError>;
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AuthStatus {
    SignedOut,
    SignedIn { scope: String, authorized_at_ms: i64 },
    ReauthRequired { reason: String },
}

/// Berechtigungen in fester Reihenfolge: Ein Refresh, der dieselben Scopes anders sortiert
/// liefert, darf nicht als Statuswechsel gelten (sonst bauen alle Abonnenten neu auf).
pub fn normalize_scope(scope: &str) -> String {
    let mut v: Vec<&str> = scope.split_whitespace().collect();
    v.sort_unstable();
    v.dedup();
    v.join(" ")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessToken {
    pub token: String,
    pub epoch: u64,
}

struct Inner {
    tokens: Option<TokenSet>,
    epoch: u64,
    reauth_reason: Option<String>,
    /// Secret Store war beim Start nicht lesbar (z. B. Anmeldespeicher kurz blockiert) →
    /// später erneut versuchen statt dauerhaft „abgemeldet“.
    load_failed: bool,
}

pub struct TokenManager {
    key: String,
    inner: Mutex<Inner>,
    refresh_lock: tokio::sync::Mutex<()>,
    endpoint: Arc<dyn TokenEndpoint>,
    store: Arc<dyn SecretStore>,
    clock: SharedClock,
    skew_ms: i64,
    refresh_count: AtomicU64,
    status_tx: watch::Sender<AuthStatus>,
}

impl TokenManager {
    /// Lädt vorhandene Tokens aus dem Secret Store.
    pub fn load(
        key: &str,
        endpoint: Arc<dyn TokenEndpoint>,
        store: Arc<dyn SecretStore>,
        clock: SharedClock,
    ) -> Arc<Self> {
        let mut load_failed = false;
        let mut tokens = None;
        // Der Anmeldespeicher des Systems kann direkt nach Anmeldung/Update kurz blockiert sein.
        for attempt in 0..3 {
            match store.load(key) {
                Ok(Some(raw)) => {
                    match serde_json::from_str::<TokenSet>(&raw) {
                        Ok(t) => tokens = Some(t),
                        Err(_) => tracing::warn!(target: "auth", key, "gespeicherte Tokens nicht lesbar – abgemeldet"),
                    }
                    load_failed = false;
                    break;
                }
                Ok(None) => {
                    load_failed = false;
                    break;
                }
                Err(e) => {
                    tracing::warn!(target: "auth", key, attempt, error = %e, "Secret Store nicht lesbar");
                    load_failed = true;
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }
        }
        let (status_tx, _) = watch::channel(AuthStatus::SignedOut);
        let tm = Arc::new(Self {
            key: key.to_string(),
            inner: Mutex::new(Inner { tokens, epoch: 1, reauth_reason: None, load_failed }),
            refresh_lock: tokio::sync::Mutex::new(()),
            endpoint,
            store,
            clock,
            skew_ms: 60_000,
            refresh_count: AtomicU64::new(0),
            status_tx,
        });
        tm.publish();
        tm
    }

    pub fn subscribe(&self) -> watch::Receiver<AuthStatus> {
        self.status_tx.subscribe()
    }

    pub fn status(&self) -> AuthStatus {
        let s = self.inner.lock_safe();
        Self::status_of(&s)
    }

    fn status_of(s: &Inner) -> AuthStatus {
        match (&s.tokens, &s.reauth_reason) {
            (Some(t), _) => AuthStatus::SignedIn { scope: normalize_scope(&t.scope), authorized_at_ms: t.authorized_at_ms },
            (None, Some(r)) => AuthStatus::ReauthRequired { reason: r.clone() },
            (None, None) => AuthStatus::SignedOut,
        }
    }

    fn publish(&self) {
        let st = self.status();
        self.status_tx.send_if_modified(|cur| {
            if *cur != st {
                *cur = st;
                true
            } else {
                false
            }
        });
    }

    pub fn epoch(&self) -> u64 {
        self.inner.lock_safe().epoch
    }

    pub fn refresh_count(&self) -> u64 {
        self.refresh_count.load(Ordering::SeqCst)
    }

    pub fn expires_at_ms(&self) -> Option<i64> {
        self.inner.lock_safe().tokens.as_ref().map(|t| t.expires_at_ms)
    }

    /// Übernimmt Tokens nach erfolgreicher Anmeldung. Beginnt eine neue Epoche.
    pub fn install(&self, set: TokenSet) -> Result<(), String> {
        let raw = serde_json::to_string(&set).map_err(|e| e.to_string())?;
        self.store.save(&self.key, &raw)?;
        {
            let mut s = self.inner.lock_safe();
            s.epoch += 1;
            s.tokens = Some(set);
            s.reauth_reason = None;
        }
        self.publish();
        Ok(())
    }

    /// Explizites Abmelden: neue Epoche, Tokens entfernen. Laufende Vorgänge
    /// verwerfen ihre Ergebnisse, weil ihre Epoche nicht mehr stimmt.
    pub fn sign_out(&self) {
        {
            let mut s = self.inner.lock_safe();
            s.epoch += 1;
            s.tokens = None;
            s.reauth_reason = None;
        }
        if let Err(e) = self.store.delete(&self.key) {
            tracing::warn!(target: "auth", key = %self.key, error = %e, "Löschen im Secret Store fehlgeschlagen");
        }
        self.publish();
    }

    /// Prüft, ob ein Ergebnis noch zur aktuellen Sitzung gehört.
    pub fn is_current(&self, epoch: u64) -> bool {
        self.epoch() == epoch
    }

    /// Gültiges Access Token (ggf. nach rechtzeitigem Refresh mit Sicherheitspuffer).
    pub async fn access_token(&self) -> Result<AccessToken, ApiError> {
        self.access_token_ahead(self.skew_ms).await
    }

    async fn access_token_ahead(&self, lead_ms: i64) -> Result<AccessToken, ApiError> {
        self.retry_load();
        {
            let s = self.inner.lock_safe();
            match &s.tokens {
                None => return Err(Self::missing_error(&s)),
                Some(t) if t.expires_at_ms - self.clock.now_ms() > lead_ms => {
                    return Ok(AccessToken { token: t.access_token.clone(), epoch: s.epoch });
                }
                Some(_) => {}
            }
        }
        self.refresh_if_needed(None, lead_ms).await
    }

    /// Nach HTTP 401 mit `rejected`: koordinierter Refresh. Hat ein anderer Aufrufer
    /// bereits erneuert, wird ohne weiteren Refresh das neue Token geliefert.
    pub async fn on_unauthorized(&self, rejected: &AccessToken) -> Result<AccessToken, ApiError> {
        self.refresh_if_needed(Some(rejected), self.skew_ms).await
    }

    /// Beim Start nicht lesbarer Secret Store: bei Bedarf erneut laden.
    pub fn retry_load(&self) {
        let mut s = self.inner.lock_safe();
        if !s.load_failed || s.tokens.is_some() {
            return;
        }
        if let Ok(raw) = self.store.load(&self.key) {
            s.load_failed = false;
            s.tokens = raw.and_then(|r| serde_json::from_str::<TokenSet>(&r).ok());
            if s.tokens.is_some() {
                tracing::info!(target: "auth", key = %self.key, "Tokens nachträglich geladen");
            }
            drop(s);
            self.publish();
        }
    }

    fn missing_error(s: &Inner) -> ApiError {
        match &s.reauth_reason {
            Some(r) => ApiError::ReauthRequired { reason: r.clone() },
            None => ApiError::NotSignedIn,
        }
    }

    async fn refresh_if_needed(&self, rejected: Option<&AccessToken>, lead_ms: i64) -> Result<AccessToken, ApiError> {
        let _guard = self.refresh_lock.lock().await;
        let (refresh_token, epoch, prev) = {
            let s = self.inner.lock_safe();
            let t = match &s.tokens {
                None => return Err(Self::missing_error(&s)),
                Some(t) => t,
            };
            if let Some(r) = rejected {
                if r.epoch != s.epoch {
                    return Err(ApiError::SessionEnded);
                }
            }
            let fresh = t.expires_at_ms - self.clock.now_ms() > lead_ms;
            let already_replaced = rejected.map(|r| r.token != t.access_token).unwrap_or(true);
            if fresh && already_replaced {
                return Ok(AccessToken { token: t.access_token.clone(), epoch: s.epoch });
            }
            let Some(rt) = t.refresh_token.clone() else {
                drop(s);
                return Err(self.fail_reauth("Kein Refresh Token vorhanden"));
            };
            (rt, s.epoch, t.clone())
        };

        self.refresh_count.fetch_add(1, Ordering::SeqCst);
        tracing::info!(target: "auth", key = %self.key, "Access Token wird erneuert");
        let result = self.endpoint.refresh(&refresh_token).await;

        match result {
            Ok(resp) => {
                let now = self.clock.now_ms();
                let set = TokenSet {
                    access_token: resp.access_token,
                    // Ohne neuen Refresh Token bleibt der bisherige gültig.
                    refresh_token: resp.refresh_token.or(prev.refresh_token),
                    expires_at_ms: now + (resp.expires_in_s as i64) * 1000,
                    scope: resp.scope.unwrap_or(prev.scope),
                    authorized_at_ms: prev.authorized_at_ms,
                };
                let mut s = self.inner.lock_safe();
                if s.epoch != epoch {
                    // Abgemeldet oder neu angemeldet, während der Refresh lief.
                    return Err(ApiError::SessionEnded);
                }
                match serde_json::to_string(&set) {
                    Ok(raw) => {
                        if let Err(e) = self.store.save(&self.key, &raw) {
                            // Im Speicher trotzdem übernehmen: Rotierende Refresh Tokens
                            // (Twitch) wären sonst verloren.
                            tracing::error!(target: "auth", key = %self.key, error = %e, "Token konnte nicht gespeichert werden");
                        }
                    }
                    Err(e) => tracing::error!(target: "auth", error = %e, "Token-Serialisierung fehlgeschlagen"),
                }
                let token = set.access_token.clone();
                s.tokens = Some(set);
                s.reauth_reason = None;
                drop(s);
                self.publish();
                Ok(AccessToken { token, epoch })
            }
            Err(ApiError::ReauthRequired { reason }) => {
                if self.epoch() != epoch {
                    return Err(ApiError::SessionEnded);
                }
                Err(self.fail_reauth(&reason))
            }
            Err(e) => {
                if self.epoch() != epoch {
                    return Err(ApiError::SessionEnded);
                }
                tracing::warn!(target: "auth", key = %self.key, code = e.code(), "Refresh fehlgeschlagen – Zugangsdaten bleiben erhalten");
                Err(e)
            }
        }
    }

    /// Vorlauf, mit dem der Wächter erneuert: ein Viertel der Laufzeit, mindestens 5, höchstens
    /// 15 Minuten. Ein Refresh im letzten Moment (bisher 60 s vorher) traf bei kurzem Netzaussetzer
    /// genau den Zeitpunkt, an dem das alte Token ablief – danach scheiterte jede Anfrage.
    pub fn keeper_lead_ms(lifetime_ms: i64) -> i64 {
        (lifetime_ms / 4).clamp(5 * 60_000, 15 * 60_000)
    }

    /// Hintergrund-Wächter: erneuert das Access Token rechtzeitig vor Ablauf und wiederholt bei
    /// Netzfehlern mit wachsendem Abstand, bis es klappt. Schläft nie länger als 60 s am Stück,
    /// damit Standby und Uhrsprünge sofort auffallen. Endet, wenn der Manager verworfen wird.
    pub async fn run_keeper(self: Arc<Self>) {
        let mut status = self.subscribe();
        let mut retry = crate::backoff::Backoff::new(std::time::Duration::from_secs(10), std::time::Duration::from_secs(300));
        let mut wait = std::time::Duration::from_secs(5);
        loop {
            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                r = status.changed() => if r.is_err() { return },
            }
            let (expires, lifetime) = {
                let s = self.inner.lock_safe();
                match &s.tokens {
                    Some(t) if t.refresh_token.is_some() => (t.expires_at_ms, (t.expires_at_ms - t.authorized_at_ms).max(0)),
                    _ => {
                        wait = std::time::Duration::from_secs(60);
                        continue;
                    }
                }
            };
            // Laufzeit des aktuellen Tokens ist unbekannt (nur Ablauf gespeichert) – Spotify 1 h,
            // Twitch ~4 h. Ohne bessere Angabe mit einer Stunde rechnen.
            let lead = Self::keeper_lead_ms(if lifetime > 0 { lifetime.min(3_600_000) } else { 3_600_000 });
            let left = expires - self.clock.now_ms();
            if left > lead {
                retry.reset();
                wait = std::time::Duration::from_millis((left - lead).clamp(1_000, 60_000) as u64);
                continue;
            }
            match self.access_token_ahead(lead).await {
                Ok(_) => {
                    retry.reset();
                    wait = std::time::Duration::from_secs(5);
                }
                Err(ApiError::ReauthRequired { .. } | ApiError::NotSignedIn | ApiError::SessionEnded) => {
                    wait = std::time::Duration::from_secs(60);
                }
                Err(e) => {
                    wait = retry.next_delay();
                    tracing::info!(target: "auth", key = %self.key, code = e.code(), retry_s = wait.as_secs(), "Vorzeitige Erneuerung verschoben");
                }
            }
        }
    }

    fn fail_reauth(&self, reason: &str) -> ApiError {
        {
            let mut s = self.inner.lock_safe();
            s.tokens = None;
            s.reauth_reason = Some(reason.to_string());
        }
        let _ = self.store.delete(&self.key);
        tracing::warn!(target: "auth", key = %self.key, "Autorisierung ungültig – erneute Anmeldung nötig");
        self.publish();
        ApiError::ReauthRequired { reason: reason.to_string() }
    }
}

#[cfg(test)]
mod keeper_tests {
    use super::*;

    #[test]
    fn scope_order_does_not_change_status() {
        assert_eq!(normalize_scope("b a  c a"), "a b c");
        assert_eq!(normalize_scope("user-read-playback-state streaming"), normalize_scope("streaming user-read-playback-state"));
    }

    #[test]
    fn keeper_refreshes_well_before_expiry() {
        assert_eq!(TokenManager::keeper_lead_ms(3_600_000), 15 * 60_000, "Spotify: 45 min nach Ausstellung");
        assert_eq!(TokenManager::keeper_lead_ms(600_000), 5 * 60_000, "kurze Tokens: mindestens 5 min Vorlauf");
        assert_eq!(TokenManager::keeper_lead_ms(14_400_000), 15 * 60_000);
    }
}
