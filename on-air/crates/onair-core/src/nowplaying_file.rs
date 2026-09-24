//! Optional: Now-Playing-Textdatei für einfache OBS-Textquellen. Wird atomar
//! ersetzt (temporäre Datei + Umbenennen), damit OBS nie eine halbe Zeile liest.

use std::path::Path;

pub fn render(template: &str, title: &str, artist: &str, requester: Option<&str>) -> String {
    template
        .replace("{title}", title)
        .replace("{artist}", artist)
        .replace("{requester}", requester.unwrap_or(""))
        .trim()
        .to_string()
}

pub fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        if existing == content {
            return Ok(());
        }
    }
    let tmp = path.with_extension("onair-tmp");
    std::fs::write(&tmp, content.as_bytes())?;
    // Unter Windows ersetzt `rename` eine vorhandene Datei (MOVEFILE_REPLACE_EXISTING).
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_atomically_and_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("np.txt");
        write_atomic(&p, "A – B").unwrap();
        write_atomic(&p, "C – D").unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "C – D");
        assert!(!p.with_extension("onair-tmp").exists());
        assert_eq!(render("{artist} – {title}", "T", "A", None), "A – T");
    }
}
