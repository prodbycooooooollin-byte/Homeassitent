//! Chatbefehle: Parser, Rollen, Cooldowns, Voteskip und Antworttexte.

use crate::queue::SubmitOutcome;
use crate::settings::{CommandCfg, CommandSettings, Replies, Role};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CommandKind {
    Sr,
    Song,
    Queue,
    Remove,
    Skip,
    VoteSkip,
}

impl CommandKind {
    pub fn cfg(self, s: &CommandSettings) -> &CommandCfg {
        match self {
            CommandKind::Sr => &s.sr,
            CommandKind::Song => &s.song,
            CommandKind::Queue => &s.queue,
            CommandKind::Remove => &s.remove,
            CommandKind::Skip => &s.skip,
            CommandKind::VoteSkip => &s.voteskip,
        }
    }
    const ALL: [CommandKind; 6] = [
        CommandKind::Sr,
        CommandKind::Song,
        CommandKind::Queue,
        CommandKind::Remove,
        CommandKind::Skip,
        CommandKind::VoteSkip,
    ];
}

/// Erkennt einen Befehl; liefert Art und Argumenttext.
pub fn parse(text: &str, s: &CommandSettings) -> Option<(CommandKind, String)> {
    let t = text.trim();
    let rest = t.strip_prefix(s.prefix.as_str())?;
    let (word, args) = match rest.split_once(char::is_whitespace) {
        Some((w, a)) => (w, a.trim()),
        None => (rest, ""),
    };
    let word = word.to_lowercase();
    for k in CommandKind::ALL {
        let c = k.cfg(s);
        if !c.enabled {
            continue;
        }
        if c.name.eq_ignore_ascii_case(&word) || c.aliases.iter().any(|a| a.eq_ignore_ascii_case(&word)) {
            return Some((k, args.chars().take(300).collect()));
        }
    }
    None
}

pub fn role_from_badges(badges: &[String], is_broadcaster: bool) -> Role {
    if is_broadcaster || badges.iter().any(|b| b == "broadcaster") {
        Role::Broadcaster
    } else if badges.iter().any(|b| b == "moderator" || b == "lead_moderator") {
        Role::Moderator
    } else if badges.iter().any(|b| b == "vip") {
        Role::Vip
    } else if badges.iter().any(|b| b == "subscriber" || b == "founder") {
        Role::Subscriber
    } else {
        Role::Everyone
    }
}

/// Cooldowns pro Befehl und Person. Moderatoren/Broadcaster sind ausgenommen.
#[derive(Default)]
pub struct Cooldowns {
    last: HashMap<(CommandKind, String), i64>,
}

impl Cooldowns {
    /// `Ok(())` wenn erlaubt (und merkt die Nutzung), sonst verbleibende Sekunden.
    pub fn check(&mut self, kind: CommandKind, user_id: &str, role: Role, cooldown_s: u32, now: i64) -> Result<(), u32> {
        if cooldown_s == 0 || role >= Role::Moderator {
            return Ok(());
        }
        let key = (kind, user_id.to_string());
        if let Some(prev) = self.last.get(&key) {
            let rem = cooldown_s as i64 * 1000 - (now - prev);
            if rem > 0 {
                return Err(((rem + 999) / 1000) as u32);
            }
        }
        self.last.insert(key, now);
        if self.last.len() > 5000 {
            self.last.retain(|_, t| now - *t < 3_600_000);
        }
        Ok(())
    }
}

/// Voteskip: Stimmen gelten nur für den aktuell laufenden Titel.
#[derive(Default)]
pub struct VoteSkip {
    track_uri: Option<String>,
    voters: HashSet<String>,
}

impl VoteSkip {
    /// Liefert (Stimmen, erreicht?).
    pub fn vote(&mut self, track_uri: &str, user_id: &str, needed: u32) -> (u32, bool) {
        if self.track_uri.as_deref() != Some(track_uri) {
            self.track_uri = Some(track_uri.to_string());
            self.voters.clear();
        }
        self.voters.insert(user_id.to_string());
        let n = self.voters.len() as u32;
        if n >= needed {
            self.voters.clear();
            self.track_uri = None;
            (n, true)
        } else {
            (n, false)
        }
    }
}

pub fn fill(template: &str, vars: &[(&str, String)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{k}}}"), v);
    }
    out
}

/// Chatnachrichten: Länge begrenzen (Twitch: 500 Zeichen) und Steuerzeichen entfernen.
pub fn sanitize_chat(text: &str) -> String {
    let clean: String = text.chars().filter(|c| !c.is_control()).collect();
    let clean = clean.trim();
    if clean.chars().count() > 480 {
        let mut s: String = clean.chars().take(477).collect();
        s.push('…');
        s
    } else {
        clean.to_string()
    }
}

pub fn reply_for_outcome(r: &Replies, o: &SubmitOutcome) -> Option<String> {
    let (tmpl, req, extra): (&str, _, Vec<(&str, String)>) = match o {
        SubmitOutcome::Duplicate => return None,
        SubmitOutcome::Accepted { request, position } => (&r.accepted, Some(request), vec![("position", position.to_string())]),
        SubmitOutcome::PendingReview { request } => (&r.pending_review, Some(request), vec![]),
        SubmitOutcome::PendingOffline { request } => (&r.pending_offline, Some(request), vec![]),
        SubmitOutcome::Rejected { code, text, request } => {
            let t = if code == "not_found" { &r.not_found } else if code == "closed" { &r.closed } else { &r.rejected };
            (t.as_str(), request.as_ref(), vec![("reason", text.clone())])
        }
    };
    if tmpl.trim().is_empty() {
        return None;
    }
    let mut vars = extra;
    if let Some(req) = req {
        vars.push(("user", req.requester.name.clone()));
        if let Some(t) = &req.track {
            vars.push(("title", t.title.clone()));
            vars.push(("artist", t.artist_line()));
        }
    }
    Some(sanitize_chat(&fill(tmpl, &vars)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_commands_and_aliases() {
        let s = CommandSettings::default();
        assert_eq!(parse("!sr never gonna", &s), Some((CommandKind::Sr, "never gonna".into())));
        assert_eq!(parse("!SongRequest x", &s), Some((CommandKind::Sr, "x".into())));
        assert_eq!(parse("!song", &s), Some((CommandKind::Song, "".into())));
        assert_eq!(parse("hello !sr", &s), None);
        assert_eq!(parse("!unknown", &s), None);
    }

    #[test]
    fn roles_from_badges() {
        assert_eq!(role_from_badges(&["moderator".into()], false), Role::Moderator);
        assert_eq!(role_from_badges(&["subscriber".into()], true), Role::Broadcaster);
        assert_eq!(role_from_badges(&[], false), Role::Everyone);
    }

    #[test]
    fn cooldown_per_user() {
        let mut c = Cooldowns::default();
        assert!(c.check(CommandKind::Song, "u", Role::Everyone, 10, 0).is_ok());
        assert_eq!(c.check(CommandKind::Song, "u", Role::Everyone, 10, 4_000), Err(6));
        assert!(c.check(CommandKind::Song, "other", Role::Everyone, 10, 4_000).is_ok());
        assert!(c.check(CommandKind::Song, "u", Role::Moderator, 10, 4_000).is_ok());
    }

    #[test]
    fn voteskip_resets_on_track_change() {
        let mut v = VoteSkip::default();
        assert_eq!(v.vote("a", "1", 2), (1, false));
        assert_eq!(v.vote("a", "1", 2), (1, false), "keine Doppelstimme");
        assert_eq!(v.vote("b", "2", 2), (1, false), "neuer Titel setzt zurück");
        assert_eq!(v.vote("b", "3", 2), (2, true));
    }

    #[test]
    fn sanitizes_long_messages() {
        let long = "x".repeat(900);
        assert_eq!(sanitize_chat(&long).chars().count(), 478);
        assert_eq!(sanitize_chat("a\nb"), "ab");
    }
}
