//! Planung bis zum Streamende: reine, deterministische Budgetberechnung.
//!
//! Freies Budget = Zeit bis zum geplanten Ende
//!               − Restlaufzeit des aktuellen Titels
//!               − Dauer eingeplanter (angenommener/übergebener) Requests
//!               − reservierte Dauer offener Prüfungen
//!               − Sicherheitspuffer
//!
//! Alle Werte intern in Millisekunden; gerundet wird erst in der Anzeige.
//! Jeder Titel wird genau einmal gezählt: der laufende Titel nur als „aktuell“,
//! übergebene Requests nur als lokale Einträge (keine zweite Zählung über Spotifys Queue).

use serde::{Deserialize, Serialize};

/// Unterhalb dieses freien Budgets passt realistisch kein Song mehr → Annahme pausiert.
pub const MIN_SLOT_MS: i64 = 60_000;
pub const DEFAULT_BUFFER_MS: i64 = 120_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlanConfig {
    pub enabled: bool,
    /// Fester Endzeitpunkt (Unix-ms). „Noch 30 Minuten“ wird beim Setzen umgerechnet –
    /// ein Neustart verlängert daher nichts.
    pub end_at_ms: Option<i64>,
    pub buffer_ms: i64,
}

impl Default for PlanConfig {
    fn default() -> Self {
        Self { enabled: false, end_at_ms: None, buffer_ms: DEFAULT_BUFFER_MS }
    }
}

impl PlanConfig {
    pub const KEY: &'static str = "plan.v1";

    pub fn is_active(&self) -> bool {
        self.enabled && self.end_at_ms.is_some()
    }
}

/// Aktuell laufender Titel aus dem synchronisierten Playback-Zustand.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentTrack {
    pub remaining_ms: i64,
    pub is_playing: bool,
    pub repeat_track: bool,
    /// `false`, wenn keine Dauer bekannt ist (z. B. Werbung, unbekannter Inhalt).
    pub duration_known: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanItem {
    pub id: String,
    pub duration_ms: Option<u64>,
    /// Offene Prüfung (Moderation): Budget ist reserviert, aber noch nicht eingeplant.
    pub reserved_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Eta {
    pub id: String,
    /// Voraussichtlicher Beginn; `None`, wenn nicht belastbar berechenbar.
    pub start_ms: Option<i64>,
    /// Endet voraussichtlich vor Endzeit − Puffer.
    pub fits: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlanStatus {
    pub active: bool,
    pub end_at_ms: Option<i64>,
    pub now_ms: i64,
    pub remaining_ms: i64,
    pub current_remaining_ms: i64,
    pub planned_ms: i64,
    pub reserved_ms: i64,
    pub buffer_ms: i64,
    pub free_ms: i64,
    /// Endzeit erreicht.
    pub ended: bool,
    /// Kein Song passt mehr (freies Budget < MIN_SLOT_MS).
    pub exhausted: bool,
    /// Bereits angenommene Wünsche passen nicht mehr (ms zu viel).
    pub overplanned_ms: i64,
    /// Gründe, warum Prognosen unsicher sind (Codes für die UI).
    pub uncertain: Vec<String>,
    pub etas: Vec<Eta>,
}

impl PlanStatus {
    pub fn inactive(now_ms: i64) -> Self {
        Self {
            active: false,
            end_at_ms: None,
            now_ms,
            remaining_ms: 0,
            current_remaining_ms: 0,
            planned_ms: 0,
            reserved_ms: 0,
            buffer_ms: 0,
            free_ms: 0,
            ended: false,
            exhausted: false,
            overplanned_ms: 0,
            uncertain: vec![],
            etas: vec![],
        }
    }
}

/// Zusätzliche Unsicherheiten, die der Aufrufer aus dem Gesamtzustand kennt.
#[derive(Debug, Clone, Default)]
pub struct Context {
    /// Wiedergabestatus nicht bestätigt (offline, veraltet, unbekannt).
    pub playback_unconfirmed: bool,
    /// Übergaben mit unklarem Ausgang vorhanden.
    pub unresolved_handoff: bool,
}

pub fn compute(cfg: &PlanConfig, now_ms: i64, current: Option<&CurrentTrack>, items: &[PlanItem], ctx: &Context) -> PlanStatus {
    let Some(end) = cfg.end_at_ms.filter(|_| cfg.enabled) else {
        return PlanStatus::inactive(now_ms);
    };
    let mut uncertain = vec![];
    if ctx.playback_unconfirmed {
        uncertain.push("playback_unconfirmed".to_string());
    }
    if ctx.unresolved_handoff {
        uncertain.push("unresolved_handoff".to_string());
    }
    let current_remaining = current.map(|c| c.remaining_ms.max(0)).unwrap_or(0);
    if let Some(c) = current {
        if c.repeat_track {
            uncertain.push("repeat_track".into());
        }
        if !c.duration_known {
            uncertain.push("unknown_current".into());
        }
        if !c.is_playing {
            uncertain.push("paused".into());
        }
    }
    let mut planned = 0i64;
    let mut reserved = 0i64;
    let mut unknown_duration = false;
    for it in items {
        match it.duration_ms {
            Some(d) if it.reserved_only => reserved += d as i64,
            Some(d) => planned += d as i64,
            None => unknown_duration = true,
        }
    }
    if unknown_duration {
        uncertain.push("unknown_duration".into());
    }
    let remaining = end - now_ms;
    let buffer = cfg.buffer_ms.max(0);
    let free = remaining - current_remaining - planned - reserved - buffer;
    let overplanned = if items.is_empty() || free >= 0 { 0 } else { (-free).min(planned + reserved) };

    // Prognose: Requests laufen direkt nach dem aktuellen Titel in Reihenfolge.
    let reliable = !uncertain.iter().any(|u| u == "repeat_track" || u == "unknown_current" || u == "playback_unconfirmed");
    let limit = end - buffer;
    let mut t = if reliable { Some(now_ms + current_remaining) } else { None };
    let etas = items
        .iter()
        .map(|it| {
            let start = t;
            let fits = match (start, it.duration_ms) {
                (Some(s), Some(d)) => Some(s + d as i64 <= limit),
                _ => None,
            };
            t = match (t, it.duration_ms) {
                (Some(s), Some(d)) => Some(s + d as i64),
                _ => None,
            };
            Eta { id: it.id.clone(), start_ms: start, fits }
        })
        .collect();

    PlanStatus {
        active: true,
        end_at_ms: Some(end),
        now_ms,
        remaining_ms: remaining,
        current_remaining_ms: current_remaining,
        planned_ms: planned,
        reserved_ms: reserved,
        buffer_ms: buffer,
        free_ms: free,
        ended: remaining <= 0,
        exhausted: remaining <= 0 || free < MIN_SLOT_MS,
        overplanned_ms: overplanned,
        uncertain,
        etas,
    }
}

/// Prüft, ob ein neuer Titel mit bekannter Dauer in das freie Budget passt.
pub fn check_fit(status: &PlanStatus, duration_ms: u64) -> Result<(), FitError> {
    if !status.active {
        return Ok(());
    }
    if status.ended {
        return Err(FitError::Ended);
    }
    if (duration_ms as i64) > status.free_ms {
        return Err(FitError::TooLong { duration_ms, free_ms: status.free_ms.max(0) });
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FitError {
    Ended,
    TooLong { duration_ms: u64, free_ms: i64 },
}

pub fn mmss(ms: i64) -> String {
    let s = (ms.max(0) + 500) / 1000;
    format!("{}:{:02}", s / 60, s % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    fn cfg(end: i64) -> PlanConfig {
        PlanConfig { enabled: true, end_at_ms: Some(end), buffer_ms: 2 * MIN }
    }
    fn cur(rem: i64, playing: bool) -> CurrentTrack {
        CurrentTrack { remaining_ms: rem, is_playing: playing, repeat_track: false, duration_known: true }
    }
    fn item(id: &str, min: u64, reserved: bool) -> PlanItem {
        PlanItem { id: id.into(), duration_ms: Some(min * 60_000), reserved_only: reserved }
    }

    #[test]
    fn example_from_requirements() {
        // Streamende in 30 Min, 21 Min Musik eingeplant (1 Min aktueller Rest + 20), Puffer 2 → frei 7.
        let st = compute(&cfg(30 * MIN), 0, Some(&cur(MIN, true)), &[item("a", 12, false), item("b", 8, false)], &Context::default());
        assert_eq!(st.free_ms, 7 * MIN);
        assert_eq!(st.planned_ms, 20 * MIN);
        assert!(!st.exhausted);
        assert_eq!(st.etas[0].start_ms, Some(MIN));
        assert_eq!(st.etas[1].start_ms, Some(13 * MIN));
        assert_eq!(st.etas[1].fits, Some(true));
        assert_eq!(check_fit(&st, 6 * 60_000 + 20_000), Ok(()));
        assert_eq!(check_fit(&st, 8 * 60_000), Err(FitError::TooLong { duration_ms: 8 * 60_000, free_ms: 7 * MIN }));
    }

    #[test]
    fn reserved_reviews_count_and_pause_consumes_time() {
        let items = [item("a", 5, false), item("r", 4, true)];
        let st = compute(&cfg(20 * MIN), 0, Some(&cur(3 * MIN, false)), &items, &Context::default());
        assert_eq!(st.reserved_ms, 4 * MIN);
        assert_eq!(st.free_ms, 20 * MIN - 3 * MIN - 5 * MIN - 4 * MIN - 2 * MIN);
        // Pause: 5 Minuten später, Restlaufzeit unverändert → Budget schrumpft um 5 Minuten.
        let later = compute(&cfg(20 * MIN), 5 * MIN, Some(&cur(3 * MIN, false)), &items, &Context::default());
        assert_eq!(later.free_ms, st.free_ms - 5 * MIN);
        assert!(later.uncertain.contains(&"paused".to_string()));
    }

    #[test]
    fn ended_and_overplanned() {
        let st = compute(&cfg(10 * MIN), 0, Some(&cur(2 * MIN, true)), &[item("a", 5, false), item("b", 5, false)], &Context::default());
        assert!(st.exhausted);
        assert_eq!(st.overplanned_ms, 4 * MIN);
        assert_eq!(st.etas[1].fits, Some(false));
        let ended = compute(&cfg(10 * MIN), 11 * MIN, None, &[], &Context::default());
        assert!(ended.ended && ended.exhausted);
        assert_eq!(check_fit(&ended, 1000), Err(FitError::Ended));
    }

    #[test]
    fn unknown_durations_and_repeat_make_eta_unreliable() {
        let items = [PlanItem { id: "x".into(), duration_ms: None, reserved_only: false }, item("y", 3, false)];
        let st = compute(&cfg(60 * MIN), 0, Some(&cur(MIN, true)), &items, &Context::default());
        assert!(st.uncertain.contains(&"unknown_duration".to_string()));
        assert_eq!(st.etas[0].start_ms, Some(MIN));
        assert_eq!(st.etas[1].start_ms, None, "nach unbekannter Dauer keine feste ETA");
        let rep = CurrentTrack { repeat_track: true, ..cur(MIN, true) };
        let st = compute(&cfg(60 * MIN), 0, Some(&rep), &[item("y", 3, false)], &Context::default());
        assert_eq!(st.etas[0].start_ms, None);
    }

    #[test]
    fn inactive_plan_never_blocks() {
        let st = compute(&PlanConfig::default(), 0, None, &[], &Context::default());
        assert!(!st.active);
        assert_eq!(check_fit(&st, u64::MAX / 4), Ok(()));
    }
}
