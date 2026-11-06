//! Wirksamer Annahmestatus aus getrennten Sperrgründen.
//!
//! Jede Funktion setzt nur ihren eigenen Grund; niemand überschreibt einen
//! gemeinsamen Schalter. „+15 Minuten“ hebt damit nur die Zeitsperre auf,
//! nie eine manuelle Pause oder eine technische Sperre.

use crate::plan::PlanStatus;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum Block {
    /// „Requests pausieren“ ist aktiv.
    ManualPause,
    /// Diese Quelle ist in den Einstellungen ausgeschaltet.
    SourceDisabled,
    /// Geplantes Streamende erreicht.
    StreamEnded,
    /// Zeitbudget ausgeschöpft.
    BudgetExhausted { free_ms: i64 },
    /// Prognose unsicher – kostenpflichtige Wünsche werden zurückgehalten.
    PlanUncertain { reasons: Vec<String> },
    /// Vorübergehend für Update/Beenden pausiert.
    UpdatePause,
    /// Kanalpunkte: Rückstände nach Start werden noch abgeglichen.
    Reconciling,
    /// Technische Einschränkung (fehlende Verbindung/Berechtigung).
    Technical { detail: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceGate {
    pub configured: bool,
    pub open: bool,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Acceptance {
    pub chat: SourceGate,
    pub channel_points: SourceGate,
    /// Mindestens ein Zuschauerweg nimmt gerade an.
    pub any_open: bool,
    /// Die Zeitplanung allein verhindert gerade die Annahme (für „automatisch pausiert“).
    pub paused_by_plan: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Inputs {
    pub manual_open: bool,
    pub chat_enabled: bool,
    pub cp_enabled: bool,
    pub update_pause: bool,
    /// Spotify angemeldet (Suche möglich). Netzwerkausfälle sperren nicht – Requests warten dann.
    pub spotify_signed_in: bool,
    /// Nur zur Anzeige; ohne Verbindung treffen ohnehin keine Chatbefehle ein.
    pub twitch_chat_connected: bool,
    /// Technisches Problem der Kanalpunkte (fehlende Berechtigung, Reward-Fehler).
    pub cp_technical: Option<String>,
    pub cp_reconciling: bool,
}

fn plan_blocks(plan: &PlanStatus, paid: bool) -> Vec<Block> {
    let mut b = vec![];
    if !plan.active {
        return b;
    }
    if plan.ended {
        b.push(Block::StreamEnded);
    } else if plan.exhausted {
        b.push(Block::BudgetExhausted { free_ms: plan.free_ms.max(0) });
    }
    if paid && !plan.uncertain.is_empty() {
        let hard: Vec<String> = plan
            .uncertain
            .iter()
            .filter(|u| matches!(u.as_str(), "repeat_track" | "unknown_duration" | "unresolved_handoff" | "playback_unconfirmed"))
            .cloned()
            .collect();
        if !hard.is_empty() {
            b.push(Block::PlanUncertain { reasons: hard });
        }
    }
    b
}

pub fn compute(i: &Inputs, plan: &PlanStatus) -> Acceptance {
    let mut common = vec![];
    if !i.manual_open {
        common.push(Block::ManualPause);
    }
    if i.update_pause {
        common.push(Block::UpdatePause);
    }
    if !i.spotify_signed_in {
        common.push(Block::Technical { detail: "spotify_not_connected".into() });
    }

    let mut chat = common.clone();
    if !i.chat_enabled {
        chat.insert(0, Block::SourceDisabled);
    }
    chat.extend(plan_blocks(plan, false));

    let mut cp = common;
    if !i.cp_enabled {
        cp.insert(0, Block::SourceDisabled);
    }
    if i.cp_enabled {
        if let Some(t) = &i.cp_technical {
            cp.push(Block::Technical { detail: t.clone() });
        }
        if i.cp_reconciling {
            cp.push(Block::Reconciling);
        }
    }
    cp.extend(plan_blocks(plan, true));

    let is_plan = |b: &Block| matches!(b, Block::StreamEnded | Block::BudgetExhausted { .. } | Block::PlanUncertain { .. });
    let only_plan = |v: &Vec<Block>| !v.is_empty() && v.iter().all(is_plan);
    let chat_gate = SourceGate { configured: i.chat_enabled, open: chat.is_empty(), blocks: chat };
    let cp_gate = SourceGate { configured: i.cp_enabled, open: cp.is_empty(), blocks: cp };
    let paused_by_plan = (i.chat_enabled && only_plan(&chat_gate.blocks)) || (i.cp_enabled && only_plan(&cp_gate.blocks));
    Acceptance {
        any_open: chat_gate.open || cp_gate.open,
        chat: chat_gate,
        channel_points: cp_gate,
        paused_by_plan,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan::{compute as plan_compute, Context, PlanConfig};

    fn open_inputs() -> Inputs {
        Inputs { manual_open: true, chat_enabled: true, cp_enabled: true, spotify_signed_in: true, twitch_chat_connected: true, ..Default::default() }
    }

    #[test]
    fn four_source_combinations() {
        let plan = PlanStatus::inactive(0);
        for (chat, cp) in [(true, false), (false, true), (true, true), (false, false)] {
            let a = compute(&Inputs { chat_enabled: chat, cp_enabled: cp, ..open_inputs() }, &plan);
            assert_eq!(a.chat.open, chat);
            assert_eq!(a.channel_points.open, cp);
            assert_eq!(a.any_open, chat || cp);
        }
    }

    #[test]
    fn manual_pause_overrides_but_keeps_configuration() {
        let a = compute(&Inputs { manual_open: false, ..open_inputs() }, &PlanStatus::inactive(0));
        assert!(!a.any_open);
        assert!(a.chat.configured && a.channel_points.configured);
        assert_eq!(a.chat.blocks, vec![Block::ManualPause]);
    }

    #[test]
    fn extending_plan_lifts_only_the_time_block() {
        let cfg = PlanConfig { enabled: true, end_at_ms: Some(60_000), buffer_ms: 0 };
        let ended = plan_compute(&cfg, 120_000, None, &[], &Context::default());
        let manual = compute(&Inputs { manual_open: false, ..open_inputs() }, &ended);
        assert!(manual.chat.blocks.contains(&Block::ManualPause) && manual.chat.blocks.contains(&Block::StreamEnded));
        assert!(!manual.paused_by_plan);
        // +15 Minuten
        let extended_cfg = PlanConfig { end_at_ms: Some(60_000 + 15 * 60_000 + 60_000), ..cfg };
        let extended = plan_compute(&extended_cfg, 120_000, None, &[], &Context::default());
        let manual = compute(&Inputs { manual_open: false, ..open_inputs() }, &extended);
        assert_eq!(manual.chat.blocks, vec![Block::ManualPause], "manuelle Pause bleibt bestehen");
        let open = compute(&open_inputs(), &extended);
        assert!(open.chat.open);
        // Nur Zeitsperre → „automatisch pausiert“.
        let auto = compute(&open_inputs(), &ended);
        assert!(auto.paused_by_plan && !auto.any_open);
    }

    #[test]
    fn paid_requests_held_back_when_plan_uncertain() {
        let cfg = PlanConfig { enabled: true, end_at_ms: Some(3_600_000), buffer_ms: 0 };
        let st = plan_compute(&cfg, 0, None, &[], &Context { playback_unconfirmed: true, ..Default::default() });
        let a = compute(&open_inputs(), &st);
        assert!(a.chat.open, "Chat: vorsichtige Planung, aber keine Sperre");
        assert!(!a.channel_points.open);
    }
}
