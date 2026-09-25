//! Startcheck, Verbindungsdiagnose und anonymisierter Diagnoseexport.
//!
//! Ein erfolgreicher OAuth-Login beweist nicht, dass alle API-Funktionen
//! zugänglich sind – deshalb werden die tatsächlich genutzten Endpunkte einzeln geprüft.

use crate::auth::AuthStatus;
use crate::error::ApiError;
use crate::runtime::Runtime;
use crate::settings as cfg;
use crate::spotify::service::SyncCmd;
use crate::twitch::service::TwitchCmd;
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatus {
    Ok,
    Warn,
    Error,
    Skipped,
}

#[derive(Debug, Clone, Serialize)]
pub struct Check {
    /// z. B. `spotify.search`
    pub id: String,
    pub status: CheckStatus,
    /// Code für UI-Text und empfohlene Handlung, z. B. `user_not_registered`.
    pub code: String,
    pub detail: String,
}

fn check(id: &str, status: CheckStatus, code: &str, detail: impl Into<String>) -> Check {
    Check { id: id.into(), status, code: code.into(), detail: detail.into() }
}

fn from_err(id: &str, e: &ApiError) -> Check {
    let code = match e {
        ApiError::Forbidden { reason: Some(r), .. } => r.clone(),
        _ => e.code().to_string(),
    };
    let status = if e.is_transient() { CheckStatus::Warn } else { CheckStatus::Error };
    check(id, status, &code, e.to_string())
}

/// `target`: `spotify`, `twitch`, `overlay` oder `all`.
pub async fn run(rt: &Runtime, target: &str) -> Vec<Check> {
    let mut out = vec![];
    let all = target == "all";
    if all || target == "spotify" {
        // Gezielte Wiederherstellung: Breaker öffnen, sofort neu abfragen.
        let _ = rt.spotify_cmd.send(SyncCmd::Recover);
        out.extend(spotify_checks(rt).await);
    }
    if all || target == "twitch" {
        let _ = rt.twitch_cmd.send(TwitchCmd::Recover);
        out.extend(twitch_checks(rt));
    }
    if all || target == "overlay" {
        let snap = rt.snapshot().await;
        out.push(if snap.overlay.running {
            check("overlay.server", CheckStatus::Ok, "ok", format!("127.0.0.1:{}", snap.overlay.port))
        } else {
            check("overlay.server", CheckStatus::Error, "overlay_port", snap.overlay.error.unwrap_or_default())
        });
        let np = cfg::read(&rt.settings).nowplaying_file.clone();
        if np.enabled {
            let p = std::path::PathBuf::from(np.path.trim());
            let ok = p.parent().map(|d| d.exists()).unwrap_or(false);
            out.push(if ok {
                check("overlay.file", CheckStatus::Ok, "ok", "")
            } else {
                check("overlay.file", CheckStatus::Error, "file_dir_missing", "Ordner existiert nicht")
            });
        }
    }
    out
}

async fn spotify_checks(rt: &Runtime) -> Vec<Check> {
    let mut out = vec![];
    let s = cfg::read(&rt.settings).spotify.clone();
    if s.client_id.trim().is_empty() {
        out.push(check("spotify.config", CheckStatus::Error, "missing_client_id", "Keine Client-ID"));
        return out;
    }
    out.push(check("spotify.config", CheckStatus::Ok, "ok", crate::spotify::redirect_uri(s.redirect_port)));
    match rt.spotify_tokens.status() {
        AuthStatus::SignedOut => {
            out.push(check("spotify.auth", CheckStatus::Error, "not_signed_in", ""));
            return out;
        }
        AuthStatus::ReauthRequired { reason } => {
            out.push(check("spotify.auth", CheckStatus::Error, "reauth_required", reason));
            return out;
        }
        AuthStatus::SignedIn { scope, authorized_at_ms } => {
            let missing: Vec<_> = crate::spotify::SCOPES.iter().filter(|x| !scope.split(' ').any(|s| s == **x)).collect();
            if missing.is_empty() {
                // Refresh Tokens laufen 6 Monate ab ursprünglicher Autorisierung (Stand 2026).
                let age_days = (rt.clock.now_ms() - authorized_at_ms) / 86_400_000;
                if age_days > 165 {
                    out.push(check("spotify.auth", CheckStatus::Warn, "refresh_token_expiring", format!("{age_days} Tage seit Anmeldung")));
                } else {
                    out.push(check("spotify.auth", CheckStatus::Ok, "ok", format!("{age_days} Tage seit Anmeldung")));
                }
            } else {
                out.push(check("spotify.auth", CheckStatus::Error, "missing_scope", format!("{missing:?}")));
            }
        }
    }
    out.push(match rt.spotify.me().await {
        Ok(_) => check("spotify.api", CheckStatus::Ok, "ok", ""),
        Err(e) => from_err("spotify.api", &e),
    });
    out.push(match rt.spotify.playback().await {
        Ok(Some(p)) => match p.device {
            Some(d) => check("spotify.device", CheckStatus::Ok, "ok", d.name),
            None => check("spotify.device", CheckStatus::Warn, "no_active_device", ""),
        },
        Ok(None) => check("spotify.device", CheckStatus::Warn, "no_active_device", ""),
        Err(e) => from_err("spotify.device", &e),
    });
    out.push(match rt.spotify.search_tracks("a", 1).await {
        Ok(_) => check("spotify.search", CheckStatus::Ok, "ok", ""),
        Err(e) => from_err("spotify.search", &e),
    });
    out.push(match rt.spotify.queue().await {
        Ok(_) => check("spotify.queue", CheckStatus::Ok, "ok", ""),
        Err(ApiError::NoActiveDevice) => check("spotify.queue", CheckStatus::Warn, "no_active_device", ""),
        Err(e) => from_err("spotify.queue", &e),
    });
    if let Some((ms, quota)) = rt.spotify.suspended_for_ms() {
        out.push(check(
            "spotify.rate",
            if quota { CheckStatus::Error } else { CheckStatus::Warn },
            if quota { "quota_exhausted" } else { "rate_limited" },
            format!("{} s", ms / 1000),
        ));
    }
    out
}

fn twitch_checks(rt: &Runtime) -> Vec<Check> {
    let st = rt.twitch_state.borrow().clone();
    let s = cfg::read(&rt.settings).twitch.clone();
    if s.client_id.trim().is_empty() {
        return vec![check("twitch.config", CheckStatus::Skipped, "missing_client_id", "optional")];
    }
    let mut out = vec![];
    out.push(match &st.auth {
        AuthStatus::SignedIn { .. } => check("twitch.auth", CheckStatus::Ok, "ok", st.identity.map(|i| i.login).unwrap_or_default()),
        AuthStatus::SignedOut => check("twitch.auth", CheckStatus::Skipped, "not_signed_in", ""),
        AuthStatus::ReauthRequired { reason } => check("twitch.auth", CheckStatus::Error, "reauth_required", reason.clone()),
    });
    use crate::twitch::service::TwitchLink;
    out.push(match &st.link {
        TwitchLink::Connected => check("twitch.chat", CheckStatus::Ok, "ok", ""),
        TwitchLink::Blocked { code } => check("twitch.chat", CheckStatus::Error, code, ""),
        TwitchLink::Reconnecting { attempt, .. } => check("twitch.chat", CheckStatus::Warn, "reconnecting", format!("Versuch {attempt}")),
        TwitchLink::Connecting => check("twitch.chat", CheckStatus::Warn, "connecting", ""),
        TwitchLink::Disabled => check("twitch.chat", CheckStatus::Skipped, "disabled", ""),
    });
    out
}

fn anon(s: &str) -> String {
    let h = Sha256::digest(format!("onair-diag:{s}").as_bytes());
    format!("anon-{}", h.iter().take(4).map(|b| format!("{b:02x}")).collect::<String>())
}

fn mask(id: &str) -> String {
    let id = id.trim();
    if id.len() <= 6 {
        return if id.is_empty() { String::new() } else { "***".into() };
    }
    format!("{}…{}", &id[..3], &id[id.len() - 3..])
}

/// Anonymisierter Diagnoseexport. Wird vor dem Speichern vollständig in der UI angezeigt.
pub async fn export(rt: &Runtime) -> serde_json::Value {
    let snap = rt.snapshot().await;
    let mut settings = snap.settings.clone();
    settings.spotify.client_id = mask(&settings.spotify.client_id);
    settings.twitch.client_id = mask(&settings.twitch.client_id);
    settings.nowplaying_file.path = if settings.nowplaying_file.path.is_empty() { String::new() } else { "<gesetzt>".into() };
    let activity: Vec<_> = snap
        .activity
        .iter()
        .map(|a| json!({ "ts": a.ts, "level": a.level, "kind": a.kind }))
        .collect();
    let queue: Vec<_> = snap
        .queue
        .iter()
        .map(|r| json!({ "id": r.id, "status": r.status, "reason": r.reason, "requester": anon(&r.requester.id), "source": r.source, "received_at": r.received_at }))
        .collect();
    json!({
        "format": "onair.diagnostics",
        "app_version": snap.app_version,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "generated_at_ms": rt.clock.now_ms(),
        "spotify": {
            "auth": match &snap.spotify.auth { AuthStatus::SignedIn { .. } => "signed_in", AuthStatus::SignedOut => "signed_out", AuthStatus::ReauthRequired { .. } => "reauth_required" },
            "link": snap.spotify.link,
            "device": match &snap.spotify.device { crate::spotify::service::DeviceState::Active { device } => json!({ "kind": device.kind, "restricted": device.is_restricted }), other => json!(other) },
            "breaker": snap.spotify.breaker,
            "last_error": snap.spotify.last_error,
            "token_refreshes": rt.spotify_tokens.refresh_count(),
            "api": rt.spotify.stats(),
        },
        "twitch": {
            "auth": match &snap.twitch.auth { AuthStatus::SignedIn { .. } => "signed_in", AuthStatus::SignedOut => "signed_out", AuthStatus::ReauthRequired { .. } => "reauth_required" },
            "link": snap.twitch.link,
            "last_error": snap.twitch.last_error,
            "token_refreshes": rt.twitch_tokens.refresh_count(),
        },
        "overlay": snap.overlay,
        "queue": queue,
        "session": snap.session,
        "activity": activity,
        "settings": settings,
        "hinweis": "Enthält keine Tokens, keine Callback-URLs und keine Namen (Anfragende sind pseudonymisiert)."
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn masks_and_anonymizes() {
        assert_eq!(super::mask("abcdef123456"), "abc…456");
        assert_eq!(super::mask(""), "");
        let a = super::anon("twitch:1");
        assert!(a.starts_with("anon-") && !a.contains("twitch"));
        assert_eq!(a, super::anon("twitch:1"));
    }
}
