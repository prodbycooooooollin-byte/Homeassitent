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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessToken {
    pub token: String,
    pub epoch: u64,
}

struct Inner {
    tokens: Option<TokenSet>,
    epoch: u64,
    reauth_reason: Option<String>,
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
        let tokens = match store.load(key) {
            Ok(Some(raw)) => match serde_json::from_str::<TokenSet>(&raw) {
                Ok(t) => Some(t),
                Err(_) => {
                    tracing::warn!(target: "auth", key, "gespeicherte Tokens nicht lesbar – abgemeldet");
                    None
                }
            },
            Ok(None) => None,
            Err(e) => {
                tracing::warn!(target: "auth", key, error = %e, "Secret Store nicht lesbar");
                None
            }
        };
        let (status_tx, _) = watch::channel(AuthStatus::SignedOut);
        let tm = Arc::new(Self {
            key: key.to_string(),
            inner: Mutex::new(Inner { tokens, epoch: 1, reauth_reason: None }),
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
        let s = self.inner.lock().unwrap();
        Self::status_of(&s)
    }

    fn status_of(s: &Inner) -> AuthStatus {
        match (&s.tokens, &s.reauth_reason) {
            (Some(t), _) => AuthStatus::SignedIn { scope: t.scope.clone(), authorized_at_ms: t.authorized_at_ms },
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
        self.inner.lock().unwrap().epoch
    }

    pub fn refresh_count(&self) -> u64 {
        self.refresh_count.load(Ordering::SeqCst)
    }

    pub fn expires_at_ms(&self) -> Option<i64> {
        self.inner.lock().unwrap().tokens.as_ref().map(|t| t.expires_at_ms)
    }

    /// Übernimmt Tokens nach erfolgreicher Anmeldung. Beginnt eine neue Epoche.
    pub fn install(&self, set: TokenSet) -> Result<(), String> {
        let raw = serde_json::to_string(&set).map_err(|e| e.to_string())?;
        self.store.save(&self.key, &raw)?;
        {
            let mut s = self.inner.lock().unwrap();
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
            let mut s = self.inner.lock().unwrap();
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
        {
            let s = self.inner.lock().unwrap();
            match &s.tokens {
                None => return Err(Self::missing_error(&s)),
                Some(t) if t.expires_at_ms - self.clock.now_ms() > self.skew_ms => {
                    return Ok(AccessToken { token: t.access_token.clone(), epoch: s.epoch });
                }
                Some(_) => {}
            }
        }
        self.refresh_if_needed(None).await
    }

    /// Nach HTTP 401 mit `rejected`: koordinierter Refresh. Hat ein anderer Aufrufer
    /// bereits erneuert, wird ohne weiteren Refresh das neue Token geliefert.
    pub async fn on_unauthorized(&self, rejected: &AccessToken) -> Result<AccessToken, ApiError> {
        self.refresh_if_needed(Some(rejected)).await
    }

    fn missing_error(s: &Inner) -> ApiError {
        match &s.reauth_reason {
            Some(r) => ApiError::ReauthRequired { reason: r.clone() },
            None => ApiError::NotSignedIn,
        }
    }

    async fn refresh_if_needed(&self, rejected: Option<&AccessToken>) -> Result<AccessToken, ApiError> {
        let _guard = self.refresh_lock.lock().await;
        let (refresh_token, epoch, prev) = {
            let s = self.inner.lock().unwrap();
            let t = match &s.tokens {
                None => return Err(Self::missing_error(&s)),
                Some(t) => t,
            };
            if let Some(r) = rejected {
                if r.epoch != s.epoch {
                    return Err(ApiError::SessionEnded);
                }
            }
            let fresh = t.expires_at_ms - self.clock.now_ms() > self.skew_ms;
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
                let mut s = self.inner.lock().unwrap();
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

    fn fail_reauth(&self, reason: &str) -> ApiError {
        {
            let mut s = self.inner.lock().unwrap();
            s.tokens = None;
            s.reauth_reason = Some(reason.to_string());
        }
        let _ = self.store.delete(&self.key);
        tracing::warn!(target: "auth", key = %self.key, "Autorisierung ungültig – erneute Anmeldung nötig");
        self.publish();
        ApiError::ReauthRequired { reason: reason.to_string() }
    }
}
