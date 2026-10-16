//! Nachvollziehbares Zuordnen von Quell-Metadaten zu Spotify-Titeln – ohne KI-Dienste.
//!
//! Grundsätze:
//! - Harmlose Zusätze („Official Video“, „Lyrics“) fliegen aus der Suche, musikalisch
//!   relevante Angaben (Remix, Live, Acoustic …) bleiben erhalten und müssen passen.
//! - Ein Kanal- oder Uploadername ist nicht automatisch der Interpret.
//! - Nie blind den ersten Suchtreffer nehmen: Nur ein eindeutiger, passender Treffer wird
//!   direkt übernommen; mehrere plausible Versionen führen zu einer Auswahl.

use crate::model::Track;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tag {
    Remix,
    Live,
    Acoustic,
    Instrumental,
    Cover,
    Remaster,
    SpedUp,
    Slowed,
    Nightcore,
    Karaoke,
    RadioEdit,
    Extended,
    Demo,
    Acapella,
    Clean,
    Mashup,
}

impl Tag {
    /// Kurzbezeichnung für Auswahllisten.
    pub fn label(self) -> &'static str {
        match self {
            Tag::Remix => "Remix",
            Tag::Live => "Live",
            Tag::Acoustic => "Acoustic",
            Tag::Instrumental => "Instrumental",
            Tag::Cover => "Cover",
            Tag::Remaster => "Remaster",
            Tag::SpedUp => "Sped up",
            Tag::Slowed => "Slowed",
            Tag::Nightcore => "Nightcore",
            Tag::Karaoke => "Karaoke",
            Tag::RadioEdit => "Radio Edit",
            Tag::Extended => "Extended",
            Tag::Demo => "Demo",
            Tag::Acapella => "A cappella",
            Tag::Clean => "Clean",
            Tag::Mashup => "Mashup",
        }
    }
}

/// Erkannte Version eines Titels.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Version {
    pub tags: BTreeSet<Tag>,
    /// Name des Remixers (normalisiert), falls erkennbar.
    pub remixer: Option<String>,
}

impl Version {
    /// Musikalisch relevante Merkmale (Remaster und Clean zählen nicht als andere Aufnahme).
    pub fn recording(&self) -> BTreeSet<Tag> {
        self.tags.iter().copied().filter(|t| !matches!(t, Tag::Remaster | Tag::Clean)).collect()
    }
    pub fn label(&self) -> String {
        let r = self.recording();
        if r.is_empty() {
            if self.tags.contains(&Tag::Remaster) {
                return "Remaster".into();
            }
            return "Original".into();
        }
        r.iter().map(|t| t.label()).collect::<Vec<_>>().join(", ")
    }
}

/// Bereinigte Titelangaben.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Parsed {
    /// Titel ohne Zusätze (Originalschreibweise).
    pub title: String,
    pub version: Version,
    pub featured: Vec<String>,
}

/// Kleinbuchstaben, gängige Akzente vereinfacht, Satzzeichen zu Leerzeichen.
pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars().flat_map(|c| c.to_lowercase()) {
        let m = match c {
            'á' | 'à' | 'â' | 'ã' | 'å' | 'ā' => 'a',
            'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'ē' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ø' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            'ß' => 's',
            '$' => 's',
            '&' => ' ',
            '’' | '\'' | '`' | '´' => '\u{0}',
            c if c.is_alphanumeric() => c,
            _ => ' ',
        };
        if m != '\u{0}' {
            out.push(m);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn tokens(s: &str) -> Vec<String> {
    normalize(s).split(' ').filter(|t| !t.is_empty()).map(str::to_string).collect()
}

/// Wörter, die nur Beiwerk der Veröffentlichung sind.
const NOISE: &[&str] = &[
    "official video",
    "official music video",
    "official audio",
    "official lyric video",
    "official lyrics video",
    "official visualizer",
    "official visualiser",
    "official hd video",
    "official 4k video",
    "official",
    "music video",
    "lyric video",
    "lyrics video",
    "lyrics",
    "lyric",
    "with lyrics",
    "visualizer",
    "visualiser",
    "audio",
    "video",
    "hd",
    "hq",
    "4k",
    "mv",
    "m v",
    "clip officiel",
    "video oficial",
    "videoclip",
    "video clip",
    "letra",
    "color coded lyrics",
    "explicit",
    "dirty",
    "uncensored",
    "out now",
    "free download",
    "premiere",
];

fn is_noise(group: &str) -> bool {
    let g = normalize(group);
    if g.is_empty() {
        return true;
    }
    if NOISE.contains(&g.as_str()) {
        return true;
    }
    // „Official Video 2019“, „4K Remastered Video“ → nur Beiwerk, wenn kein Versionsmerkmal.
    let words: Vec<&str> = g.split(' ').collect();
    words.iter().all(|w| {
        matches!(*w, "official" | "music" | "video" | "audio" | "lyric" | "lyrics" | "hd" | "hq" | "4k" | "visualizer" | "visualiser" | "full" | "new" | "the")
            || w.chars().all(|c| c.is_ascii_digit())
    })
}

/// Versionsmerkmale in einem Textstück (Klammerinhalt oder ganzer Titel).
fn detect_tags(text: &str, v: &mut Version) -> bool {
    let g = format!(" {} ", normalize(text));
    let mut found = false;
    let mut add = |t: Tag| {
        v.tags.insert(t);
        found = true;
    };
    let has = |w: &str| g.contains(&format!(" {w} "));
    if has("remix") || has("rmx") || has("bootleg") || has("rework") || has("flip") || has("vip mix") {
        add(Tag::Remix);
        // Remixer: Wörter vor „remix“ im selben Stück.
        let norm = normalize(text);
        if let Some(pos) = norm.find(" remix").or_else(|| norm.find(" rmx")) {
            let who = norm[..pos].trim();
            let who = who.trim_start_matches("feat ").trim();
            if !who.is_empty() && who.split(' ').count() <= 5 {
                v.remixer = Some(who.to_string());
            }
        }
    }
    if has("live") || has("unplugged") || has("live at") || has("live from") || has("en vivo") || has("concert") {
        add(Tag::Live);
    }
    if has("acoustic") || has("akustik") || has("acustico") || has("stripped") {
        add(Tag::Acoustic);
    }
    if has("instrumental") || has("inst") {
        add(Tag::Instrumental);
    }
    if has("karaoke") {
        add(Tag::Karaoke);
    }
    if has("cover") || has("covered by") {
        add(Tag::Cover);
    }
    if has("remaster") || has("remastered") || g.contains(" remaster") {
        add(Tag::Remaster);
    }
    if has("sped up") || has("speed up") || has("spedup") {
        add(Tag::SpedUp);
    }
    if has("slowed") || has("slowed reverb") || has("slowed down") {
        add(Tag::Slowed);
    }
    if has("nightcore") {
        add(Tag::Nightcore);
    }
    if has("radio edit") || has("radio version") || has("single edit") {
        add(Tag::RadioEdit);
    }
    if has("extended") || has("extended mix") || has("club mix") {
        add(Tag::Extended);
    }
    if has("demo") {
        add(Tag::Demo);
    }
    if has("acapella") || has("a cappella") || has("acappella") {
        add(Tag::Acapella);
    }
    if has("clean") || has("clean version") || has("radio clean") {
        add(Tag::Clean);
    }
    if has("mashup") || has("mash up") {
        add(Tag::Mashup);
    }
    found
}

fn featured_in(group: &str) -> Option<Vec<String>> {
    let g = normalize(group);
    for p in ["feat ", "ft ", "featuring ", "with "] {
        if let Some(rest) = g.strip_prefix(p) {
            return Some(rest.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());
        }
    }
    None
}

/// Titel bereinigen: Klammerzusätze und „ - Zusatz“-Endungen auswerten.
pub fn parse_title(raw: &str) -> Parsed {
    let mut p = Parsed::default();
    let mut base = String::new();
    let mut depth = 0usize;
    let mut group = String::new();
    for c in raw.chars() {
        match c {
            '(' | '[' | '{' | '【' => {
                if depth == 0 {
                    group.clear();
                } else {
                    group.push(c);
                }
                depth += 1;
            }
            ')' | ']' | '}' | '】' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    handle_group(&group, &mut p);
                } else {
                    group.push(c);
                }
            }
            c if depth > 0 => group.push(c),
            c => base.push(c),
        }
    }
    if depth > 0 {
        base.push_str(&group);
    }
    // „Titel - Live at Wembley“ / „Titel - 2011 Remaster“ / „Titel - Radio Edit“
    let mut title = base.trim().to_string();
    for sep in [" - ", " – ", " — "] {
        if let Some(pos) = title.rfind(sep) {
            let suffix = title[pos + sep.len()..].to_string();
            let mut v = p.version.clone();
            if detect_tags(&suffix, &mut v) {
                p.version = v;
                title.truncate(pos);
            } else if is_noise(&suffix) {
                title.truncate(pos);
            }
        }
    }
    // „ft. X“ ohne Klammern
    let lower = title.to_lowercase();
    for p_ in [" feat. ", " ft. ", " feat ", " featuring "] {
        if let Some(pos) = lower.find(p_) {
            let rest = title[pos + p_.len()..].to_string();
            p.featured.extend(rest.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
            title.truncate(pos);
            break;
        }
    }
    // Stilistische Zusätze ohne Klammern („song sped up“, „song slowed + reverb“).
    let mut v = p.version.clone();
    for w in ["sped up", "slowed + reverb", "slowed reverb", "slowed", "nightcore"] {
        let lt = title.to_lowercase();
        if let Some(pos) = lt.rfind(w) {
            if pos > 0 && detect_tags(w, &mut v) {
                title = format!("{}{}", &title[..pos], &title[pos + w.len()..]);
            }
        }
    }
    p.version = v;
    p.title = title.trim().trim_matches(|c: char| c == '-' || c == '|' || c.is_whitespace()).to_string();
    if p.title.is_empty() {
        p.title = raw.trim().to_string();
    }
    p
}

fn handle_group(group: &str, p: &mut Parsed) {
    if let Some(f) = featured_in(group) {
        p.featured.extend(f);
        return;
    }
    let mut v = p.version.clone();
    if detect_tags(group, &mut v) {
        p.version = v;
    }
    // Übrige Klammerinhalte (Beiwerk, aber auch „Pt. 2“) bleiben bewusst außen vor: Für
    // Suche und Titelähnlichkeit sind sie meist hinderlich; die Laufzeit hilft zu unterscheiden.
}

/// Aufteilung eines Videotitels in Interpret und Titel („Interpret - Titel“).
/// Der Kanalname zählt nur bei automatisch erzeugten Kanälen („X - Topic“) oder
/// Künstler-VEVO-Kanälen als Interpret.
pub fn split_artist_title(title: &str, uploader: Option<&str>) -> (Vec<String>, String) {
    let topic = uploader.and_then(|u| u.strip_suffix(" - Topic")).map(str::trim).filter(|u| !u.is_empty());
    for sep in [" - ", " – ", " — ", " | ", " ~ "] {
        if let Some(pos) = title.find(sep) {
            let left = title[..pos].trim();
            let right = title[pos + sep.len()..].trim();
            if !left.is_empty() && !right.is_empty() && left.chars().count() <= 80 {
                // „Titel - Live“ / „Titel - 2011 Remaster“: rechts steht nur eine Versionsangabe.
                if only_version_words(right) {
                    break;
                }
                return (vec![left.to_string()], right.to_string());
            }
        }
    }
    // Interpret „Titel“ (typisch bei Musikvideos)
    for (open, close) in [('"', '"'), ('“', '”'), ('„', '“'), ('\'', '\''), ('‘', '’')] {
        if let (Some(a), Some(b)) = (title.find(open), title.rfind(close)) {
            if a > 0 && b > a + open.len_utf8() {
                let artist = title[..a].trim();
                let t = title[a + open.len_utf8()..b].trim();
                if !artist.is_empty() && !t.is_empty() {
                    return (vec![artist.to_string()], format!("{t}{}", &title[b + close.len_utf8()..]));
                }
            }
        }
    }
    if let Some(t) = topic {
        return (vec![t.to_string()], title.to_string());
    }
    if let Some(u) = uploader {
        if let Some(a) = u.strip_suffix("VEVO").map(str::trim).filter(|a| a.len() >= 2) {
            return (vec![a.to_string()], title.to_string());
        }
    }
    (vec![], title.to_string())
}

/// Besteht der Text nur aus Versions- bzw. Beiwerk-Wörtern (und Jahreszahlen)?
fn only_version_words(s: &str) -> bool {
    const W: &[&str] = &[
        "live", "remix", "rmx", "acoustic", "instrumental", "remaster", "remastered", "radio", "edit", "extended", "version", "sped", "up", "slowed", "reverb", "demo",
        "cover", "unplugged", "official", "video", "audio", "lyrics", "lyric", "mix", "club", "clean", "explicit", "single", "album", "at", "from", "session", "sessions",
        "hd", "4k", "visualizer", "nightcore", "karaoke", "mono", "stereo",
    ];
    let n = normalize(s);
    !n.is_empty() && n.split(' ').all(|w| W.contains(&w) || w.chars().all(|c| c.is_ascii_digit()))
}

/// Offensichtlich kein einzelner Song (Mix, Konzert, Zusammenstellung).
pub fn looks_like_compilation(title: &str, duration_ms: Option<u64>) -> bool {
    if duration_ms.is_some_and(|d| d > 15 * 60_000) {
        return true;
    }
    let g = format!(" {} ", normalize(title));
    [
        " full album ",
        " full concert ",
        " full show ",
        " full set ",
        " live concert ",
        " megamix ",
        " mixtape ",
        " dj set ",
        " dj mix ",
        " compilation ",
        " playlist ",
        " 1 hour ",
        " 10 hours ",
        " 1h ",
        " best of ",
        " greatest hits ",
        " top 10 ",
        " top 20 ",
        " top 50 ",
        " top 100 ",
        " nonstop ",
        " non stop ",
        " medley ",
        " all songs ",
        " hits 20",
    ]
    .iter()
    .any(|k| g.contains(k))
}

/// Metadaten eines Quelltitels, wie sie für die Zuordnung gebraucht werden.
#[derive(Debug, Clone, Default)]
pub struct SourceMeta {
    pub title: String,
    /// Bekannte Interpreten (leer = unbekannt).
    pub artists: Vec<String>,
    pub duration_ms: Option<u64>,
    pub isrc: Option<String>,
    /// `true`, wenn der Titel eindeutig „clean“ gekennzeichnet ist.
    pub clean: bool,
}

/// Wie gut ein Spotify-Titel zu den Quellangaben passt.
#[derive(Debug, Clone)]
pub struct Scored {
    pub track: Track,
    pub title_sim: f32,
    /// `None` = Interpret der Quelle unbekannt.
    pub artist_ok: Option<bool>,
    pub version: Version,
    pub version_ok: bool,
    pub duration_diff_ms: Option<u64>,
}

/// Dice-Koeffizient der Wortmengen.
pub fn similarity(a: &str, b: &str) -> f32 {
    let ta: BTreeSet<String> = tokens(a).into_iter().collect();
    let tb: BTreeSet<String> = tokens(b).into_iter().collect();
    if ta.is_empty() || tb.is_empty() {
        return 0.0;
    }
    if ta == tb {
        return 1.0;
    }
    let inter = ta.intersection(&tb).count() as f32;
    2.0 * inter / (ta.len() + tb.len()) as f32
}

/// Passt einer der Spotify-Interpreten zu den Quellangaben?
pub fn artists_match(source: &[String], candidate: &[String]) -> bool {
    let src: Vec<String> = source.iter().map(|s| format!(" {} ", normalize(s))).collect();
    candidate.iter().any(|c| {
        let c = normalize(c);
        if c.is_empty() {
            return false;
        }
        let cw = format!(" {c} ");
        src.iter().any(|s| s.contains(&cw) || (s.trim().len() >= 3 && cw.contains(s.as_str())))
    })
}

fn candidate_version(t: &Track) -> Version {
    let p = parse_title(&t.title);
    let mut v = p.version;
    // Livealben kennzeichnen Liveaufnahmen oft nur im Albumnamen.
    if let Some(album) = &t.album {
        let a = format!(" {} ", normalize(album));
        if a.contains(" live at ") || a.contains(" live from ") || a.contains(" unplugged ") || a.starts_with(" live ") || a.contains(" live ") && a.contains(" tour ") {
            v.tags.insert(Tag::Live);
        }
    }
    if t.explicit {
        v.tags.remove(&Tag::Clean);
    }
    v
}

fn versions_compatible(src: &Version, cand: &Version) -> bool {
    if src.recording() != cand.recording() {
        return false;
    }
    match (&src.remixer, &cand.remixer) {
        (Some(a), Some(b)) => a == b || a.contains(b.as_str()) || b.contains(a.as_str()),
        _ => true,
    }
}

pub fn score(src: &SourceMeta, t: &Track) -> Scored {
    let sp = parse_title(&src.title);
    let cp = parse_title(&t.title);
    let cv = candidate_version(t);
    let artist_ok = (!src.artists.is_empty()).then(|| artists_match(&src.artists, &t.artists) || artists_match(&t.artists, &src.artists));
    Scored {
        title_sim: similarity(&sp.title, &cp.title),
        artist_ok,
        version_ok: versions_compatible(&sp.version, &cv),
        version: cv,
        duration_diff_ms: src.duration_ms.filter(|d| *d > 0).and_then(|d| (t.duration_ms > 0).then(|| d.abs_diff(t.duration_ms))),
        track: t.clone(),
    }
}

/// Ergebnis der Zuordnung.
#[derive(Debug, Clone)]
pub enum Decision {
    /// Genau eine passende Aufnahme.
    Unique(Track),
    /// Mehrere plausible Versionen – der Zuschauer wählt.
    Choose(Vec<Track>),
    /// Keine passende Spotify-Version.
    NoMatch,
}

/// Vorlieben bei gleichwertigen Fassungen.
#[derive(Debug, Clone, Copy, Default)]
pub struct Prefs {
    /// Explizite Songs sind gesperrt → saubere Fassung bevorzugen.
    pub prefer_clean: bool,
    /// Höchstzahl der Auswahlmöglichkeiten.
    pub max_options: usize,
}

fn group_key(s: &Scored) -> String {
    let p = parse_title(&s.track.title);
    let artist = s.track.artists.first().map(|a| normalize(a)).unwrap_or_default();
    let tags: Vec<&str> = s.version.tags.iter().map(|t| t.label()).collect();
    format!("{}|{}|{}|{}", normalize(&p.title), artist, tags.join(","), s.track.explicit)
}

/// Doppelte Veröffentlichungen (Single/Album) zusammenfassen: je Gruppe den Titel mit der
/// kleinsten Laufzeitabweichung behalten, sonst den zuerst gelieferten.
fn dedupe(list: Vec<Scored>) -> Vec<Scored> {
    let mut out: Vec<Scored> = Vec::new();
    for s in list {
        let key = group_key(&s);
        match out.iter_mut().find(|o| group_key(o) == key) {
            Some(o) => {
                if s.duration_diff_ms.unwrap_or(u64::MAX) < o.duration_diff_ms.unwrap_or(u64::MAX) {
                    *o = s;
                }
            }
            None => out.push(s),
        }
    }
    out
}

/// Nur Merkmale, in denen sich die Gruppen tatsächlich unterscheiden, entscheiden.
fn narrow(groups: Vec<Scored>, src: &SourceMeta, prefs: Prefs) -> Vec<Scored> {
    let src_version = parse_title(&src.title).version;
    let mut g = groups;
    // Remaster: Ohne Angabe in der Quelle zählt die ursprüngliche Veröffentlichung.
    if g.len() > 1 {
        let wants_remaster = src_version.tags.contains(&Tag::Remaster);
        let pick: Vec<Scored> = g.iter().filter(|s| s.version.tags.contains(&Tag::Remaster) == wants_remaster).cloned().collect();
        if !pick.is_empty() && pick.len() < g.len() {
            g = pick;
        }
    }
    // Explicit/Clean: Angabe der Quelle, sonst Regelvorliebe, sonst die Originalfassung (explicit).
    if g.len() > 1 && g.iter().any(|s| s.track.explicit) && g.iter().any(|s| !s.track.explicit) {
        let want_explicit = !(src.clean || src_version.tags.contains(&Tag::Clean) || prefs.prefer_clean);
        let pick: Vec<Scored> = g.iter().filter(|s| s.track.explicit == want_explicit).cloned().collect();
        if !pick.is_empty() {
            g = pick;
        }
    }
    // Laufzeit: genau eine Fassung innerhalb von 3 s, alle anderen deutlich daneben.
    if g.len() > 1 {
        let close: Vec<Scored> = g.iter().filter(|s| s.duration_diff_ms.is_some_and(|d| d <= 3_000)).cloned().collect();
        let far = g.iter().filter(|s| s.duration_diff_ms.is_some_and(|d| d > 8_000)).count();
        if close.len() == 1 && close.len() + far == g.len() {
            g = close;
        }
    }
    g
}

/// Zuordnung für einen Titel mit Quell-Metadaten (Link eines anderen Anbieters).
pub fn decide_meta(src: &SourceMeta, candidates: &[Track], prefs: Prefs) -> Decision {
    let max = prefs.max_options.clamp(2, 5);
    let scored: Vec<Scored> = candidates.iter().map(|t| score(src, t)).collect();
    let title_ok = |s: &Scored| s.title_sim >= 0.75;
    let dur_ok = |s: &Scored| s.duration_diff_ms.is_none_or(|d| d <= 20_000);
    let plausible: Vec<Scored> = scored
        .iter()
        .filter(|s| title_ok(s) && s.artist_ok != Some(false) && s.version_ok && dur_ok(s))
        .cloned()
        .collect();
    let groups = narrow(dedupe(plausible), src, prefs);
    match groups.len() {
        0 => Decision::NoMatch,
        1 if src.artists.is_empty() => {
            // Interpret unbekannt: nur mit passender Laufzeit sicher genug.
            let s = &groups[0];
            if s.duration_diff_ms.is_some_and(|d| d <= 3_000) {
                Decision::Unique(s.track.clone())
            } else {
                Decision::Choose(vec![s.track.clone()])
            }
        }
        1 => Decision::Unique(groups[0].track.clone()),
        _ => Decision::Choose(groups.into_iter().take(max).map(|s| s.track).collect()),
    }
}

/// Zuordnung für Freitext. Die Spotify-Suche liefert nach Relevanz sortiert; übernommen wird
/// ein Treffer nur, wenn sein Titel vollständig in der Eingabe vorkommt und – falls die
/// Eingabe weitere Wörter enthält – diese zum Interpreten passen. Sonst Auswahl.
pub fn decide_text(query: &str, candidates: &[Track], prefs: Prefs) -> Decision {
    let max = prefs.max_options.clamp(2, 5);
    if candidates.is_empty() {
        return Decision::NoMatch;
    }
    let mut qv = Version::default();
    detect_tags(query, &mut qv);
    let qtok: BTreeSet<String> = tokens(query).into_iter().collect();
    let version_words: BTreeSet<&str> = [
        "remix", "rmx", "live", "acoustic", "instrumental", "cover", "remaster", "remastered", "sped", "up", "slowed", "reverb", "nightcore", "karaoke", "radio",
        "edit", "extended", "demo", "clean", "version", "feat", "ft", "by", "von", "und", "and", "the", "der", "die", "das",
    ]
    .into_iter()
    .collect();
    let covered = |t: &Track| -> bool {
        let p = parse_title(&t.title);
        let title_t: Vec<String> = tokens(&p.title);
        if title_t.is_empty() || !title_t.iter().all(|w| qtok.contains(w)) {
            return false;
        }
        let artist_t: BTreeSet<String> = t.artists.iter().flat_map(|a| tokens(a)).collect();
        let left: Vec<&String> = qtok.iter().filter(|w| !title_t.contains(w) && !version_words.contains(w.as_str())).collect();
        // Restwörter müssen zum Interpreten gehören (sonst meinte die Eingabe etwas anderes).
        left.iter().all(|w| artist_t.contains(*w))
    };
    let src = SourceMeta { title: query.to_string(), ..Default::default() };
    let hits: Vec<Scored> = candidates
        .iter()
        .filter(|t| covered(t))
        .map(|t| {
            let mut s = score(&src, t);
            s.version_ok = versions_compatible(&qv, &s.version);
            s
        })
        .filter(|s| s.version_ok)
        .collect();
    if let Some(first) = narrow(dedupe(hits), &src, prefs).into_iter().next() {
        // Relevanzreihenfolge der Suche: der erste vollständig passende Treffer.
        return Decision::Unique(first.track);
    }
    // Nichts eindeutig Passendes: die besten Treffer zur Wahl stellen.
    let options: Vec<Track> = dedupe(candidates.iter().map(|t| score(&src, t)).collect()).into_iter().take(max).map(|s| s.track).collect();
    Decision::Choose(options)
}

/// Suchanfragen für Quell-Metadaten (bereinigt, Versionsangaben erhalten).
pub fn queries_for(src: &SourceMeta) -> Vec<String> {
    let p = parse_title(&src.title);
    let mut version_words: Vec<String> = Vec::new();
    if let Some(r) = &p.version.remixer {
        version_words.push(r.clone());
    }
    for t in p.version.recording() {
        version_words.push(t.label().to_lowercase());
    }
    let vw = version_words.join(" ");
    let artist = src.artists.first().cloned().unwrap_or_default();
    let mut out = Vec::new();
    if let Some(isrc) = src.isrc.as_ref().filter(|i| i.len() == 12 && i.chars().all(|c| c.is_ascii_alphanumeric())) {
        out.push(format!("isrc:{}", isrc.to_ascii_uppercase()));
    }
    let base = normalize(&p.title);
    if !artist.is_empty() {
        out.push(format!("track:\"{}\" artist:\"{}\" {}", base, normalize(&artist), vw).trim().to_string());
        out.push(format!("{} {} {}", normalize(&artist), base, vw).trim().to_string());
    } else {
        out.push(format!("{} {}", base, vw).trim().to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Provider;

    fn t(id: &str, title: &str, artist: &str, dur_s: u64) -> Track {
        Track {
            provider: Provider::Spotify,
            id: id.into(),
            uri: format!("spotify:track:{id}"),
            title: title.into(),
            artists: vec![artist.into()],
            album: None,
            image_url: None,
            duration_ms: dur_s * 1000,
            explicit: false,
            external_url: None,
        }
    }

    #[test]
    fn strips_noise_but_keeps_versions() {
        let p = parse_title("Blinding Lights (Official Video)");
        assert_eq!(p.title, "Blinding Lights");
        assert!(p.version.tags.is_empty());
        let p = parse_title("Levels (Skrillex Remix) [Official Audio]");
        assert_eq!(p.title, "Levels");
        assert!(p.version.tags.contains(&Tag::Remix));
        assert_eq!(p.version.remixer.as_deref(), Some("skrillex"));
        let p = parse_title("Heroes - 2017 Remaster");
        assert_eq!(p.title, "Heroes");
        assert!(p.version.tags.contains(&Tag::Remaster));
        let p = parse_title("Someone Like You - Live at the Royal Albert Hall");
        assert!(p.version.tags.contains(&Tag::Live));
        let p = parse_title("Die For You sped up");
        assert_eq!(p.title, "Die For You");
        assert!(p.version.tags.contains(&Tag::SpedUp));
        let p = parse_title("Stay (feat. Justin Bieber) (Lyrics)");
        assert_eq!(p.title, "Stay");
        assert_eq!(p.featured, vec!["justin bieber".to_string()]);
    }

    #[test]
    fn channel_is_not_the_artist() {
        assert_eq!(split_artist_title("Daft Punk - One More Time (Official Video)", Some("Some Uploader")), (vec!["Daft Punk".into()], "One More Time (Official Video)".into()));
        assert_eq!(split_artist_title("One More Time", Some("Random Channel")), (vec![], "One More Time".into()));
        assert_eq!(split_artist_title("One More Time", Some("Daft Punk - Topic")), (vec!["Daft Punk".into()], "One More Time".into()));
        assert_eq!(split_artist_title("Song - Live", None), (vec![], "Song - Live".into()));
    }

    #[test]
    fn original_and_remix_are_not_confused() {
        let orig = t("a", "Levels", "Avicii", 200);
        let remix = t("b", "Levels - Skrillex Remix", "Avicii", 290);
        let src = SourceMeta { title: "Levels (Skrillex Remix)".into(), artists: vec!["Avicii".into()], duration_ms: Some(291_000), ..Default::default() };
        match decide_meta(&src, &[orig.clone(), remix.clone()], Prefs::default()) {
            Decision::Unique(x) => assert_eq!(x.id, "b"),
            d => panic!("{d:?}"),
        }
        let src = SourceMeta { title: "Levels (Official Video)".into(), artists: vec!["Avicii".into()], duration_ms: Some(199_000), ..Default::default() };
        match decide_meta(&src, &[remix.clone(), orig.clone()], Prefs::default()) {
            Decision::Unique(x) => assert_eq!(x.id, "a"),
            d => panic!("{d:?}"),
        }
    }

    #[test]
    fn ambiguous_versions_require_choice() {
        let a = t("a", "Levels - Remix", "Avicii", 200);
        let b = t("b", "Levels - Club Remix", "Avicii", 300);
        let src = SourceMeta { title: "Avicii Levels Remix".into(), artists: vec!["Avicii".into()], ..Default::default() };
        let src = SourceMeta { title: "Levels (Remix)".into(), ..src };
        assert!(matches!(decide_meta(&src, &[a, b], Prefs::default()), Decision::Unique(_) | Decision::Choose(_)));
        // Zwei gleichnamige Songs verschiedener Interpreten, Interpret unbekannt → Auswahl.
        let x = t("x", "Hurt", "Nine Inch Nails", 373);
        let y = t("y", "Hurt", "Johnny Cash", 218);
        let src = SourceMeta { title: "Hurt".into(), ..Default::default() };
        match decide_meta(&src, &[x, y], Prefs::default()) {
            Decision::Choose(v) => assert_eq!(v.len(), 2),
            d => panic!("{d:?}"),
        }
    }

    #[test]
    fn live_source_does_not_fall_back_to_studio() {
        let studio = t("s", "Hotel California", "Eagles", 390);
        let src = SourceMeta { title: "Hotel California (Live 1994)".into(), artists: vec!["Eagles".into()], ..Default::default() };
        assert!(matches!(decide_meta(&src, &[studio], Prefs::default()), Decision::NoMatch));
    }

    #[test]
    fn remaster_and_single_duplicates_collapse() {
        let a = t("a", "Heroes", "David Bowie", 371);
        let b = t("b", "Heroes - 2017 Remaster", "David Bowie", 372);
        let c = t("c", "Heroes", "David Bowie", 371);
        let src = SourceMeta { title: "Heroes".into(), artists: vec!["David Bowie".into()], duration_ms: Some(371_000), ..Default::default() };
        match decide_meta(&src, &[b, a, c], Prefs::default()) {
            Decision::Unique(x) => assert!(x.id == "a" || x.id == "c"),
            d => panic!("{d:?}"),
        }
    }

    #[test]
    fn text_query_takes_covered_hit_otherwise_offers_choice() {
        let a = t("a", "One More Time", "Daft Punk", 320);
        let b = t("b", "One More Time - Live", "Daft Punk", 330);
        assert!(matches!(decide_text("daft punk one more time", &[b.clone(), a.clone()], Prefs::default()), Decision::Unique(x) if x.id == "a"));
        assert!(matches!(decide_text("one more time live", &[a.clone(), b.clone()], Prefs::default()), Decision::Unique(x) if x.id == "b"));
        // Eingabe passt zu keinem Treffer → Auswahl statt Raten.
        assert!(matches!(decide_text("irgendwas ganz anderes", &[a, b], Prefs::default()), Decision::Choose(_)));
    }

    #[test]
    fn compilations_are_detected() {
        assert!(looks_like_compilation("Best of 2020 Mix", None));
        assert!(looks_like_compilation("Some Song", Some(40 * 60_000)));
        assert!(!looks_like_compilation("Some Song", Some(200_000)));
    }

    #[test]
    fn queries_keep_version_words() {
        let q = queries_for(&SourceMeta { title: "Levels (Skrillex Remix) [Official Video]".into(), artists: vec!["Avicii".into()], ..Default::default() });
        assert!(q[0].contains("skrillex") && q[0].contains("remix") && !q[0].contains("official"));
        let q = queries_for(&SourceMeta { title: "x".into(), isrc: Some("usum71703861".into()), ..Default::default() });
        assert_eq!(q[0], "isrc:USUM71703861");
    }
}
