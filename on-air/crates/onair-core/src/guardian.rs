//! Verbindungswächter: unabhängige zweite Instanz über Spotify- und Twitch-Dienst.
//!
//! Die Dienste haben eigene Wiederholungslogik. Der Wächter fängt die Fälle ab, in denen sie
//! trotzdem stehen bleiben würden – genau die, nach denen Streamer bisher von Hand „neu
//! verbinden“ mussten:
//!
//! - Spotify angemeldet, aber seit Langem keine bestätigte Antwort, obwohl keine Rate-Limit-,
//!   Kontingent- oder Berechtigungssperre vorliegt (hängender Worker, verpasster Weckruf).
//! - Ein geplanter Wiederholungszeitpunkt ist deutlich überschritten, ohne dass etwas passiert.
//! - Twitch angemeldet, aber „Verbinde …“ hängt, oder der Dienst steht auf „aus“.
//! - Twitch „gesperrt“ (z. B. vorübergehender 403 oder ein widerrufenes Abo): früher eine
//!   Sackgasse bis zum Neustart, jetzt in wachsenden Abständen erneut versucht.
//!
//! Die Entscheidung ist eine reine Funktion (`Guardian::observe`) und ohne IO testbar.

use crate::auth::AuthStatus;
use crate::spotify::service::{LinkState, SpotifyState};
use crate::twitch::service::{TwitchLink, TwitchState};
use serde::Serialize;

/// Prüfabstand des Wächters.
pub const TICK_MS: u64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Service {
    Spotify,
    Twitch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Heal {
    pub service: Service,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Default)]
struct Track {
    /// Seit wann der aktuelle Problemzustand besteht.
    bad_since: Option<i64>,
    /// Letzter Eingriff.
    last_heal: Option<i64>,
    /// Eingriffe in Folge ohne Besserung (für wachsende Abstände).
    streak: u32,
}

impl Track {
    fn healthy(&mut self) {
        self.bad_since = None;
        self.streak = 0;
    }

    /// Abstand zwischen zwei Eingriffen: 1, 2, 4 … höchstens `max_ms`.
    fn gap_ms(&self, base_ms: i64, max_ms: i64) -> i64 {
        (base_ms << self.streak.saturating_sub(1).min(5)).min(max_ms)
    }

    fn due(&mut self, now: i64, grace_ms: i64, base_ms: i64, max_ms: i64) -> bool {
        let since = *self.bad_since.get_or_insert(now);
        if now - since < grace_ms {
            return false;
        }
        if let Some(last) = self.last_heal {
            if now - last < self.gap_ms(base_ms, max_ms) {
                return false;
            }
        }
        self.last_heal = Some(now);
        self.streak += 1;
        true
    }
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct ReliabilityInfo {
    /// Automatische Wiederherstellungen seit App-Start.
    pub heals: u32,
    pub last_heal_ms: Option<i64>,
    pub last_heal_service: Option<Service>,
    pub last_heal_reason: Option<String>,
    /// Ununterbrochen gesund seit (beide angemeldeten Dienste verbunden).
    pub healthy_since_ms: Option<i64>,
}

#[derive(Debug, Default)]
pub struct Guardian {
    spotify: Track,
    twitch: Track,
    blocked: Track,
    pub info: ReliabilityInfo,
}

fn signed_in(a: &AuthStatus) -> bool {
    matches!(a, AuthStatus::SignedIn { .. })
}

impl Guardian {
    /// Bewertet den aktuellen Zustand. `poll_max_ms` = längstes reguläres Abfrageintervall.
    pub fn observe(&mut self, now: i64, sp: &SpotifyState, tw: &TwitchState, poll_max_ms: u64) -> Vec<Heal> {
        let mut out = Vec::new();

        // ---- Spotify ----
        if signed_in(&sp.auth) {
            let stale_after = (poll_max_ms as i64 * 4).max(45_000);
            let problem: Option<&'static str> = match &sp.link {
                // Anbieterseitige Sperren: Der Dienst wartet absichtlich – nicht eingreifen.
                LinkState::RateLimited { .. } | LinkState::QuotaExhausted { .. } | LinkState::Blocked { .. } => None,
                LinkState::Degraded { next_retry_ms, .. } | LinkState::Offline { next_retry_ms, .. } => {
                    (now - next_retry_ms > 30_000).then_some("retry_overdue")
                }
                LinkState::Unknown => Some("no_answer"),
                LinkState::Online => match sp.last_ok_ms {
                    Some(ok) if now - ok > stale_after => Some("stale"),
                    None => Some("no_answer"),
                    _ => None,
                },
            };
            match problem {
                // „Unbekannt“ direkt nach dem Start braucht etwas Zeit.
                Some(reason) => {
                    let grace = if reason == "no_answer" { 30_000 } else { 0 };
                    if self.spotify.due(now, grace, 60_000, 600_000) {
                        out.push(Heal { service: Service::Spotify, reason });
                    }
                }
                None => self.spotify.healthy(),
            }
        } else {
            self.spotify.healthy();
        }

        // ---- Twitch ----
        if signed_in(&tw.auth) {
            let problem: Option<(&'static str, i64)> = match &tw.link {
                TwitchLink::Connected => None,
                TwitchLink::Connecting => Some(("connect_hangs", 60_000)),
                TwitchLink::Disabled => Some(("idle_while_signed_in", 30_000)),
                TwitchLink::Reconnecting { next_retry_ms, .. } => (now - next_retry_ms > 45_000).then_some(("retry_overdue", 0)),
                TwitchLink::Blocked { .. } => None,
            };
            match problem {
                Some((reason, grace)) => {
                    if self.twitch.due(now, grace, 60_000, 600_000) {
                        out.push(Heal { service: Service::Twitch, reason });
                    }
                }
                None => self.twitch.healthy(),
            }
            // Gesperrt: erst nach 5 min, dann 10, 20 … höchstens alle 30 min erneut versuchen.
            if matches!(tw.link, TwitchLink::Blocked { .. }) {
                if self.blocked.due(now, 5 * 60_000, 10 * 60_000, 30 * 60_000) {
                    out.push(Heal { service: Service::Twitch, reason: "blocked_retry" });
                }
            } else {
                self.blocked.healthy();
            }
        } else {
            self.twitch.healthy();
            self.blocked.healthy();
        }

        // ---- Gesamtzustand ----
        let sp_ok = !signed_in(&sp.auth) || matches!(sp.link, LinkState::Online);
        let tw_ok = !signed_in(&tw.auth) || matches!(tw.link, TwitchLink::Connected);
        if sp_ok && tw_ok {
            self.info.healthy_since_ms.get_or_insert(now);
        } else {
            self.info.healthy_since_ms = None;
        }
        for h in &out {
            self.info.heals += 1;
            self.info.last_heal_ms = Some(now);
            self.info.last_heal_service = Some(h.service);
            self.info.last_heal_reason = Some(h.reason.to_string());
        }
        out
    }
}

/// Text für das Aktivitätsprotokoll.
pub fn describe(h: &Heal) -> String {
    let svc = match h.service {
        Service::Spotify => "Spotify",
        Service::Twitch => "Twitch",
    };
    let why = match h.reason {
        "stale" => "keine neuen Daten",
        "no_answer" => "keine Antwort",
        "retry_overdue" => "Wiederholung hing",
        "connect_hangs" => "Verbindungsaufbau hing",
        "idle_while_signed_in" => "Dienst stand still",
        "blocked_retry" => "erneuter Versuch nach Sperre",
        other => other,
    };
    format!("{svc}: Verbindung automatisch erneuert ({why})")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backoff::BreakerState;
    use crate::model::PlaybackView;

    fn sp(link: LinkState, last_ok: Option<i64>) -> SpotifyState {
        SpotifyState {
            auth: AuthStatus::SignedIn { scope: String::new(), authorized_at_ms: 0 },
            link,
            device: crate::spotify::service::DeviceState::Unknown,
            playback: PlaybackView::Unknown,
            last_ok_ms: last_ok,
            last_error: None,
            breaker: BreakerState::Closed,
            seq: 0,
        }
    }

    fn tw(link: TwitchLink) -> TwitchState {
        TwitchState {
            auth: AuthStatus::SignedIn { scope: String::new(), authorized_at_ms: 0 },
            link,
            identity: None,
            last_error: None,
            connected_since_ms: None,
        }
    }

    fn off() -> TwitchState {
        TwitchState { auth: AuthStatus::SignedOut, link: TwitchLink::Disabled, identity: None, last_error: None, connected_since_ms: None }
    }

    #[test]
    fn healthy_services_are_left_alone() {
        let mut g = Guardian::default();
        for i in 0..100 {
            let now = 1_000_000 + i * 10_000;
            assert!(g.observe(now, &sp(LinkState::Online, Some(now - 2_000)), &tw(TwitchLink::Connected), 5_000).is_empty());
        }
        assert_eq!(g.info.heals, 0);
        assert_eq!(g.info.healthy_since_ms, Some(1_000_000));
    }

    #[test]
    fn stale_spotify_is_recovered_with_growing_gaps() {
        let mut g = Guardian::default();
        let s = sp(LinkState::Online, Some(0));
        let mut heals = vec![];
        for i in 0..200 {
            let now = 100_000 + i * 10_000;
            if !g.observe(now, &s, &off(), 5_000).is_empty() {
                heals.push(now);
            }
        }
        assert_eq!(heals[0], 100_000, "sofort, wenn Daten veraltet sind");
        let gaps: Vec<i64> = heals.windows(2).map(|w| w[1] - w[0]).collect();
        assert_eq!(&gaps[..4], &[60_000, 120_000, 240_000, 480_000]);
        assert!(gaps.iter().all(|g| *g <= 600_000));
    }

    #[test]
    fn provider_limits_are_respected() {
        let mut g = Guardian::default();
        for link in [LinkState::RateLimited { until_ms: 0 }, LinkState::QuotaExhausted { until_ms: 0 }, LinkState::Blocked { code: "x".into() }] {
            for i in 0..50 {
                assert!(g.observe(i * 10_000, &sp(link.clone(), Some(0)), &off(), 5_000).is_empty());
            }
        }
    }

    #[test]
    fn overdue_retry_and_hanging_connect_are_detected() {
        let mut g = Guardian::default();
        let s = sp(LinkState::Degraded { failures: 2, next_retry_ms: 0 }, Some(0));
        assert!(g.observe(10_000, &s, &off(), 5_000).is_empty(), "Wiederholung noch nicht überfällig");
        assert_eq!(g.observe(40_000, &s, &off(), 5_000)[0].reason, "retry_overdue");

        let mut g = Guardian::default();
        let ok = sp(LinkState::Online, Some(0));
        assert!(g.observe(0, &ok, &tw(TwitchLink::Connecting), 5_000).is_empty());
        assert!(g.observe(50_000, &sp(LinkState::Online, Some(50_000)), &tw(TwitchLink::Connecting), 5_000).is_empty());
        let h = g.observe(60_000, &sp(LinkState::Online, Some(60_000)), &tw(TwitchLink::Connecting), 5_000);
        assert_eq!(h, vec![Heal { service: Service::Twitch, reason: "connect_hangs" }]);
    }

    #[test]
    fn blocked_twitch_is_retried_instead_of_dead_end() {
        let mut g = Guardian::default();
        let t = tw(TwitchLink::Blocked { code: "forbidden".into() });
        let s = sp(LinkState::Online, Some(0));
        let mut at = vec![];
        for i in 0..400 {
            let now = i * 10_000;
            let s = SpotifyState { last_ok_ms: Some(now), ..s.clone() };
            if g.observe(now, &s, &t, 5_000).iter().any(|h| h.reason == "blocked_retry") {
                at.push(now);
            }
        }
        assert_eq!(at[0], 300_000, "erster Versuch nach 5 min");
        assert_eq!(at[1] - at[0], 600_000);
        assert!(at.windows(2).all(|w| w[1] - w[0] <= 1_800_000));
    }

    #[test]
    fn signed_out_services_are_ignored() {
        let mut g = Guardian::default();
        let s = SpotifyState { auth: AuthStatus::SignedOut, ..sp(LinkState::Unknown, None) };
        for i in 0..50 {
            assert!(g.observe(i * 10_000, &s, &off(), 5_000).is_empty());
        }
    }
}
