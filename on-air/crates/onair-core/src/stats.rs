//! Chat-Statistiken: meistgespielte Songs, Künstler, Alben und Wünscher aus dem Verlauf.
//!
//! Reine Auswertung ohne IO – die Zeilen liefert `QueueStore::play_rows`.

use crate::storage::HISTORY_RETENTION_DAYS;
use std::collections::HashMap;

/// Wonach gerankt wird.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subject {
    Songs,
    Artists,
    Albums,
    Requesters,
}

/// Betrachteter Zeitraum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Period {
    /// Laufende Session (siehe `queue::service::SESSION_GAP_MS`).
    Stream,
    /// Gleitend: die letzten n Tage.
    Days(u32),
    /// Alles, was noch gespeichert ist (`HISTORY_RETENTION_DAYS`).
    All,
}

impl Period {
    /// Zeitraum aus dem Argument des Befehls (`!topsongs woche`); ohne oder unbekannt: alles
    /// Gespeicherte. Nur das erste Wort zählt.
    pub fn parse(arg: &str) -> Period {
        match arg.split_whitespace().next().map(str::to_lowercase).as_deref() {
            Some("stream" | "session" | "sitzung" | "live") => Period::Stream,
            Some("woche" | "week" | "7" | "7d") => Period::Days(7),
            Some("monat" | "month" | "30" | "30d") => Period::Days(30),
            _ => Period::All,
        }
    }

    /// Text für die Chatantwort (`{period}`).
    pub fn label(self) -> String {
        match self {
            Period::Stream => "dieser Stream".into(),
            Period::Days(d) => format!("letzte {d} Tage"),
            Period::All => format!("letzte {HISTORY_RETENTION_DAYS} Tage"),
        }
    }
}

/// Welche Verlaufszeilen gelesen werden.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayScope {
    Session(i64),
    /// Ab diesem Zeitpunkt (ms); `0` = alles.
    Since(i64),
}

/// Eine tatsächlich gespielte Wiedergabe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayRow {
    pub uri: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub requester: Option<String>,
    pub played_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ranked {
    pub label: String,
    pub count: u32,
}

struct Acc {
    label: String,
    count: u32,
    last: i64,
}

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Die `limit` häufigsten Einträge. Gleichstand: zuletzt Gespielte zuerst, dann alphabetisch –
/// die Reihenfolge ist damit reproduzierbar.
///
/// - Songs zählen je Titel-URI; Künstler zählen bei Gemeinschaftsstücken jeder genannte Künstler;
///   Alben je Album und Hauptkünstler; Wünscher nur über Wiedergaben mit Wunsch.
pub fn rank(rows: &[PlayRow], subject: Subject, limit: usize) -> Vec<Ranked> {
    let mut acc: HashMap<String, Acc> = HashMap::new();
    let mut bump = |key: String, label: &str, at: i64| {
        let e = acc.entry(key).or_insert_with(|| Acc { label: label.to_string(), count: 0, last: i64::MIN });
        e.count += 1;
        if at >= e.last {
            // Schreibweise der jüngsten Wiedergabe.
            e.last = at;
            e.label = label.to_string();
        }
    };
    for r in rows {
        match subject {
            Subject::Songs => {
                let title = r.title.trim();
                if title.is_empty() {
                    continue;
                }
                let key = if r.uri.is_empty() { format!("t:{}|{}", norm(title), norm(r.artists.first().map(String::as_str).unwrap_or(""))) } else { r.uri.clone() };
                let label = if r.artists.is_empty() { title.to_string() } else { format!("{title} – {}", r.artists.join(", ")) };
                bump(key, &label, r.played_at);
            }
            Subject::Artists => {
                let mut seen = Vec::new();
                for a in r.artists.iter().map(|a| a.trim()).filter(|a| !a.is_empty()) {
                    let k = norm(a);
                    if seen.contains(&k) {
                        continue;
                    }
                    bump(k.clone(), a, r.played_at);
                    seen.push(k);
                }
            }
            Subject::Albums => {
                let Some(album) = r.album.as_deref().map(str::trim).filter(|a| !a.is_empty()) else { continue };
                let artist = r.artists.first().map(|a| a.trim()).unwrap_or("");
                let label = if artist.is_empty() { album.to_string() } else { format!("{album} – {artist}") };
                bump(format!("{}|{}", norm(album), norm(artist)), &label, r.played_at);
            }
            Subject::Requesters => {
                let Some(name) = r.requester.as_deref().map(str::trim).filter(|n| !n.is_empty()) else { continue };
                bump(norm(name), name, r.played_at);
            }
        }
    }
    let mut list: Vec<Acc> = acc.into_values().collect();
    list.sort_by(|a, b| b.count.cmp(&a.count).then(b.last.cmp(&a.last)).then_with(|| a.label.cmp(&b.label)));
    list.into_iter().take(limit).map(|a| Ranked { label: a.label, count: a.count }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(uri: &str, title: &str, artists: &[&str], album: Option<&str>, who: Option<&str>, at: i64) -> PlayRow {
        PlayRow { uri: uri.into(), title: title.into(), artists: artists.iter().map(|a| a.to_string()).collect(), album: album.map(str::to_string), requester: who.map(str::to_string), played_at: at }
    }

    fn sample() -> Vec<PlayRow> {
        vec![
            row("u1", "Alpha", &["A"], Some("Album 1"), Some("Mia"), 10),
            row("u2", "Beta", &["A", "B"], Some("Album 1"), None, 20),
            row("u1", "Alpha", &["A"], Some("Album 1"), Some("mia"), 30),
            row("u3", "Gamma", &["B"], Some("Album 2"), Some("Tom"), 40),
            row("u4", "Delta", &["C"], None, Some("Tom"), 50),
        ]
    }

    #[test]
    fn songs_count_per_track() {
        let r = rank(&sample(), Subject::Songs, 3);
        assert_eq!(r[0], Ranked { label: "Alpha – A".into(), count: 2 });
        // Gleichstand bei 1: zuletzt gespielt zuerst (Delta 50, Gamma 40).
        assert_eq!(r[1].label, "Delta – C");
        assert_eq!(r[2].label, "Gamma – B");
    }

    #[test]
    fn every_credited_artist_counts_once_per_play() {
        let r = rank(&sample(), Subject::Artists, 5);
        assert_eq!(r[0], Ranked { label: "A".into(), count: 3 });
        assert_eq!(r[1], Ranked { label: "B".into(), count: 2 });
        assert_eq!(r[2], Ranked { label: "C".into(), count: 1 });
        // Doppelt genannter Künstler in einer Wiedergabe zählt nur einmal.
        let r = rank(&[row("u", "T", &["X", "x"], None, None, 1)], Subject::Artists, 5);
        assert_eq!(r, vec![Ranked { label: "X".into(), count: 1 }]);
    }

    #[test]
    fn albums_group_by_album_and_main_artist() {
        let r = rank(&sample(), Subject::Albums, 5);
        assert_eq!(r[0], Ranked { label: "Album 1 – A".into(), count: 3 });
        assert_eq!(r[1], Ranked { label: "Album 2 – B".into(), count: 1 });
        assert_eq!(r.len(), 2, "ohne Album keine Zeile");
        // Gleicher Albumname, anderer Künstler: getrennt.
        let r = rank(&[row("1", "a", &["X"], Some("Hits"), None, 1), row("2", "b", &["Y"], Some("Hits"), None, 2)], Subject::Albums, 5);
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn requesters_ignore_case_and_unrequested_plays() {
        let r = rank(&sample(), Subject::Requesters, 5);
        assert_eq!(r[0], Ranked { label: "Tom".into(), count: 2 }, "Gleichstand: zuletzt Gespielter zuerst");
        assert_eq!(r[1], Ranked { label: "mia".into(), count: 2 }, "jüngste Schreibweise");
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn limit_and_empty() {
        assert_eq!(rank(&sample(), Subject::Songs, 1).len(), 1);
        assert!(rank(&[], Subject::Songs, 5).is_empty());
    }

    #[test]
    fn period_arguments() {
        assert_eq!(Period::parse(""), Period::All);
        assert_eq!(Period::parse("Woche"), Period::Days(7));
        assert_eq!(Period::parse("week extra"), Period::Days(7));
        assert_eq!(Period::parse("MONAT"), Period::Days(30));
        assert_eq!(Period::parse("stream"), Period::Stream);
        assert_eq!(Period::parse("session"), Period::Stream);
        assert_eq!(Period::parse("irgendwas"), Period::All);
        assert_eq!(Period::Stream.label(), "dieser Stream");
        assert_eq!(Period::Days(7).label(), "letzte 7 Tage");
        assert_eq!(Period::All.label(), format!("letzte {HISTORY_RETENTION_DAYS} Tage"));
    }
}
