//! Chatbefehle: Parser, Rollen, Cooldowns, Voteskip und Antworttexte.

use crate::queue::SubmitOutcome;
use crate::settings::{CommandCfg, CommandSettings, CustomCommand, Replies, Role};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CommandKind {
    Sr,
    Song,
    Queue,
    Remove,
    Skip,
    VoteSkip,
    Playlist,
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
            CommandKind::Playlist => &s.playlist,
        }
    }
    const ALL: [CommandKind; 7] = [
        CommandKind::Sr,
        CommandKind::Song,
        CommandKind::Queue,
        CommandKind::Remove,
        CommandKind::Skip,
        CommandKind::VoteSkip,
        CommandKind::Playlist,
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

/// Eigener Befehl zum Text? Eingebaute Befehle haben Vorrang (siehe `parse`).
pub fn parse_custom<'a>(text: &str, s: &'a CommandSettings) -> Option<(&'a CustomCommand, String)> {
    let rest = text.trim().strip_prefix(s.prefix.as_str())?;
    let (word, args) = match rest.split_once(char::is_whitespace) {
        Some((w, a)) => (w, a.trim()),
        None => (rest, ""),
    };
    let word = word.to_lowercase();
    if word.is_empty() {
        return None;
    }
    s.custom
        .iter()
        .filter(|c| c.enabled && !c.reply.trim().is_empty())
        .find(|c| c.name == word || c.aliases.contains(&word))
        .map(|c| (c, args.chars().take(300).collect()))
}

/// Werte für die Platzhalter eigener Befehle.
#[derive(Debug, Clone, Default)]
pub struct CustomCtx {
    pub user: String,
    pub args: String,
    pub channel: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub link: Option<String>,
    pub requester: Option<String>,
    pub queue_count: usize,
    pub next: Option<String>,
    pub playlist: Option<String>,
}

/// Platzhalter, die eigene Befehle kennen (für UI und Doku).
pub const CUSTOM_PLACEHOLDERS: &[&str] =
    &["user", "touser", "args", "channel", "song", "title", "artist", "link", "requester", "queue_count", "next", "playlist", "random:1-100", "pick:a|b|c"];

/// Ersetzt Platzhalter in der Antwort eines eigenen Befehls. Unbekannte Platzhalter bleiben
/// stehen; Werte aus dem Chat (`args`, `touser`) werden nie erneut ausgewertet.
pub fn render_custom(template: &str, ctx: &CustomCtx, rng: &mut impl rand::Rng) -> String {
    let nothing = "–".to_string();
    let first_arg = ctx.args.split_whitespace().next().map(|a| a.trim_start_matches('@').to_string()).filter(|a| !a.is_empty());
    let song = match (&ctx.title, &ctx.artist) {
        (Some(t), Some(a)) if !a.is_empty() => format!("{t} – {a}"),
        (Some(t), _) => t.clone(),
        _ => nothing.clone(),
    };
    let mut out = String::with_capacity(template.len() + 32);
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            rest = "";
            break;
        };
        let key = &after[..end];
        let value = match key {
            "user" => Some(ctx.user.clone()),
            "touser" => Some(first_arg.clone().unwrap_or_else(|| ctx.user.clone())),
            "args" => Some(ctx.args.clone()),
            "channel" => Some(ctx.channel.clone()),
            "song" => Some(song.clone()),
            "title" => Some(ctx.title.clone().unwrap_or_else(|| nothing.clone())),
            "artist" => Some(ctx.artist.clone().unwrap_or_else(|| nothing.clone())),
            "link" => Some(ctx.link.clone().unwrap_or_else(|| nothing.clone())),
            "requester" => Some(ctx.requester.clone().unwrap_or_else(|| ctx.channel.clone())),
            "queue_count" => Some(ctx.queue_count.to_string()),
            "next" => Some(ctx.next.clone().unwrap_or_else(|| nothing.clone())),
            "playlist" => Some(ctx.playlist.clone().unwrap_or_else(|| nothing.clone())),
            k if k.starts_with("random:") => {
                let (a, b) = k[7..].split_once('-').unwrap_or(("1", "100"));
                match (a.trim().parse::<i64>(), b.trim().parse::<i64>()) {
                    (Ok(a), Ok(b)) if a <= b => Some(rng.random_range(a..=b).to_string()),
                    _ => None,
                }
            }
            k if k.starts_with("pick:") => {
                let options: Vec<&str> = k[5..].split('|').map(str::trim).filter(|o| !o.is_empty()).collect();
                (!options.is_empty()).then(|| options[rng.random_range(0..options.len())].to_string())
            }
            _ => None,
        };
        match value {
            Some(v) => out.push_str(&v),
            None => {
                out.push('{');
                out.push_str(key);
                out.push('}');
            }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
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
    last: HashMap<(String, String), i64>,
}

impl Cooldowns {
    /// `Ok(())` wenn erlaubt (und merkt die Nutzung), sonst verbleibende Sekunden.
    /// `command`: stabiler Schlüssel des Befehls (eingebaut: Name der Art, eigene: ID).
    pub fn check(&mut self, command: &str, user_id: &str, role: Role, cooldown_s: u32, now: i64) -> Result<(), u32> {
        if cooldown_s == 0 || role >= Role::Moderator {
            return Ok(());
        }
        let key = (command.to_string(), user_id.to_string());
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

/// Chat-Antwort auf eine Kanalpunkte-Einlösung: dieselben Texte wie bei `!sr`, immer mit
/// Nennung der Person; bei Ablehnung mit Hinweis auf die Erstattung.
/// `refund`: Punkte werden bei Ablehnung automatisch erstattet (nur verwaltete Belohnung).
pub fn reply_for_redemption(r: &Replies, o: &SubmitOutcome, user: &str, refund: bool) -> Option<String> {
    let base = reply_for_outcome(r, o)?;
    let mut text = if base.contains("{user}") { base.replace("{user}", user) } else { base };
    if refund && matches!(o, SubmitOutcome::Rejected { .. }) && !r.points_refund.trim().is_empty() {
        text.push_str(&r.points_refund);
    }
    Some(sanitize_chat(&text))
}

/// Öffentlicher Link zur laufenden Playlist bzw. zum Album für `!playlist`.
pub fn playlist_link(url: Option<String>) -> Option<String> {
    url.filter(|u| u.starts_with("https://open.spotify.com/"))
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

    fn custom(name: &str, reply: &str) -> CustomCommand {
        CustomCommand { id: name.into(), name: name.into(), reply: reply.into(), ..Default::default() }
    }

    #[test]
    fn custom_commands_parse_after_builtins() {
        let mut s = CommandSettings {
            custom: vec![custom("discord", "discord.gg/x"), custom("song", "nie"), CustomCommand { enabled: false, ..custom("off", "x") }],
            ..Default::default()
        };
        s.custom[0].aliases = vec!["dc".into()];
        assert_eq!(parse_custom("!Discord", &s).map(|(c, _)| c.id.as_str()), Some("discord"));
        assert_eq!(parse_custom("!dc hallo welt", &s).map(|(_, a)| a), Some("hallo welt".into()));
        assert!(parse_custom("!off", &s).is_none(), "deaktiviert");
        assert!(parse_custom("discord", &s).is_none(), "ohne Präfix");
        // Eingebaute Befehle gehen vor (Aufrufer prüft `parse` zuerst).
        assert_eq!(parse("!song", &s).map(|(k, _)| k), Some(CommandKind::Song));
    }

    #[test]
    fn custom_placeholders() {
        let ctx = CustomCtx {
            user: "Kira".into(),
            args: "@Tom {user} hi".into(),
            channel: "streamer".into(),
            title: Some("Song".into()),
            artist: Some("Band".into()),
            queue_count: 3,
            ..Default::default()
        };
        let mut rng = rand::rng();
        assert_eq!(render_custom("{user} umarmt {touser}!", &ctx, &mut rng), "Kira umarmt Tom!");
        assert_eq!(render_custom("Läuft: {song} · {queue_count} warten · {next}", &ctx, &mut rng), "Läuft: Song – Band · 3 warten · –");
        // Chat-Eingaben werden nicht erneut ausgewertet.
        assert_eq!(render_custom("{args}", &ctx, &mut rng), "@Tom {user} hi");
        assert_eq!(render_custom("{unbekannt} {offen", &ctx, &mut rng), "{unbekannt} {offen");
        for _ in 0..50 {
            let n: i64 = render_custom("{random:3-5}", &ctx, &mut rng).parse().unwrap();
            assert!((3..=5).contains(&n));
            assert!(["a", "b"].contains(&render_custom("{pick:a|b}", &ctx, &mut rng).as_str()));
        }
        assert_eq!(render_custom("{requester}", &ctx, &mut rng), "streamer");
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
        assert!(c.check("Song", "u", Role::Everyone, 10, 0).is_ok());
        assert_eq!(c.check("Song", "u", Role::Everyone, 10, 4_000), Err(6));
        assert!(c.check("Song", "other", Role::Everyone, 10, 4_000).is_ok());
        assert!(c.check("Song", "u", Role::Moderator, 10, 4_000).is_ok());
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
