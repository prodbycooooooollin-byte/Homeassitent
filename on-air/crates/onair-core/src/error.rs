use serde::Serialize;

/// Klassifizierte Fehler der externen Dienste. Jede Variante führt zu einer
/// eigenen Reaktion (siehe `docs/ARCHITEKTUR.md`, Abschnitt Fehlerbehandlung).
#[derive(Debug, Clone, thiserror::Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ApiError {
    /// 401 – nach koordiniertem Refresh weiterhin abgelehnt.
    #[error("Nicht autorisiert")]
    Unauthorized,
    /// 403 – fehlende Berechtigung, Kontovoraussetzung oder App-Zugang.
    #[error("Zugriff verweigert: {message}")]
    Forbidden { reason: Option<String>, message: String },
    /// 403 mit Grund PREMIUM_REQUIRED.
    #[error("Spotify Premium erforderlich")]
    PremiumRequired,
    /// 404 NO_ACTIVE_DEVICE bzw. keine Geräte vorhanden.
    #[error("Kein aktives Wiedergabegerät")]
    NoActiveDevice,
    #[error("Nicht gefunden")]
    NotFound,
    /// 429 – `Retry-After` wird respektiert.
    #[error("Rate Limit – Pause {retry_after_ms} ms")]
    RateLimited { retry_after_ms: u64 },
    /// 429 mit sehr langer Sperre: wird als Kontingent-Erschöpfung behandelt.
    #[error("API-Kontingent erschöpft – Pause {retry_after_ms} ms")]
    QuotaExhausted { retry_after_ms: u64 },
    #[error("Dienststörung (HTTP {status})")]
    Server { status: u16 },
    #[error("Netzwerkfehler: {message}")]
    Network { message: String, possibly_delivered: bool },
    /// Refresh Token bestätigt ungültig (`invalid_grant`) oder Autorisierung widerrufen.
    #[error("Erneute Anmeldung nötig: {reason}")]
    ReauthRequired { reason: String },
    #[error("Nicht angemeldet")]
    NotSignedIn,
    /// Die Sitzung wurde während der Anfrage beendet (Abmelden); Ergebnis verworfen.
    #[error("Sitzung beendet")]
    SessionEnded,
    #[error("Ungültige Anfrage: {message}")]
    BadRequest { message: String },
    #[error("Antwort nicht lesbar: {message}")]
    Decode { message: String },
    /// Anfrage lokal zurückgehalten (Circuit Breaker offen oder Rate-Limit-Pause aktiv).
    #[error("Vorübergehend ausgesetzt ({retry_in_ms} ms)")]
    Suspended { retry_in_ms: u64 },
    #[error("Konfiguration fehlt: {message}")]
    Config { message: String },
}

impl ApiError {
    /// Stabiler Code für UI-Texte und Diagnose.
    pub fn code(&self) -> &'static str {
        match self {
            ApiError::Unauthorized => "unauthorized",
            ApiError::Forbidden { .. } => "forbidden",
            ApiError::PremiumRequired => "premium_required",
            ApiError::NoActiveDevice => "no_active_device",
            ApiError::NotFound => "not_found",
            ApiError::RateLimited { .. } => "rate_limited",
            ApiError::QuotaExhausted { .. } => "quota_exhausted",
            ApiError::Server { .. } => "server_error",
            ApiError::Network { .. } => "network",
            ApiError::ReauthRequired { .. } => "reauth_required",
            ApiError::NotSignedIn => "not_signed_in",
            ApiError::SessionEnded => "session_ended",
            ApiError::BadRequest { .. } => "bad_request",
            ApiError::Decode { .. } => "decode",
            ApiError::Suspended { .. } => "suspended",
            ApiError::Config { .. } => "config",
        }
    }

    /// Vorübergehender Fehler, bei dem Zugangsdaten erhalten bleiben und später erneut versucht wird.
    pub fn is_transient(&self) -> bool {
        matches!(
            self,
            ApiError::Network { .. }
                | ApiError::Server { .. }
                | ApiError::RateLimited { .. }
                | ApiError::QuotaExhausted { .. }
                | ApiError::Suspended { .. }
        )
    }

    /// Kann eine schreibende Operation trotz Fehler ausgeführt worden sein?
    pub fn is_ambiguous_write(&self) -> bool {
        match self {
            ApiError::Network { possibly_delivered, .. } => *possibly_delivered,
            // 503 signalisiert üblicherweise „nicht verarbeitet“; bei 500/502/504 ist das offen.
            ApiError::Server { status } => *status != 503,
            _ => false,
        }
    }
}

/// Serialisierbare Fehlerbeschreibung für UI und Diagnose (ohne Secrets).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ErrorInfo {
    pub code: String,
    /// Technische Details, in der UI aufklappbar.
    pub details: String,
    pub at_ms: i64,
}

impl ErrorInfo {
    pub fn from_api(e: &ApiError, at_ms: i64) -> Self {
        Self { code: e.code().to_string(), details: e.to_string(), at_ms }
    }
}
