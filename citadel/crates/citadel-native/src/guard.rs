//! Dateizugriff nur innerhalb registrierter Deadlock-Installationen und nur auf bekannte Config-Dateien.

use crate::{NativeError, Result};
use std::path::{Component, Path, PathBuf};

/// Relativpfade (ab Installationswurzel), die CITADEL lesen und schreiben darf.
pub const WRITABLE: &[&str] = &["game/citadel/cfg/video.txt", "game/citadel/gameinfo.gi", "game/citadel/cfg/autoexec.cfg"];

/// Verzeichnis, in dem zusätzliche .cfg-Dateien nur gelesen werden dürfen.
pub const READABLE_CFG_DIR: &str = "game/citadel/cfg";

pub fn kind_of(rel: &str) -> Option<&'static str> {
    match normalize_rel(rel).ok()?.as_str() {
        "game/citadel/cfg/video.txt" => Some("video.txt"),
        "game/citadel/gameinfo.gi" => Some("gameinfo.gi"),
        "game/citadel/cfg/autoexec.cfg" => Some("autoexec.cfg"),
        _ => None,
    }
}

/// Normalisiert einen Relativpfad (Slashes, keine `..`, nicht absolut).
pub fn normalize_rel(rel: &str) -> Result<String> {
    let p = Path::new(rel);
    if p.is_absolute() || rel.contains(':') {
        return Err(NativeError::Path(format!("absoluter Pfad nicht erlaubt: {rel}")));
    }
    let mut parts = Vec::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => parts.push(s.to_string_lossy().replace('\\', "/")),
            Component::CurDir => {}
            _ => return Err(NativeError::Path(format!("unzulässiger Pfadbestandteil in {rel}"))),
        }
    }
    let joined = parts.join("/").replace('\\', "/");
    if joined.split('/').any(|s| s == "..") {
        return Err(NativeError::Path(format!("Pfadausbruch in {rel}")));
    }
    Ok(joined)
}

/// Prüft, dass `root` eine Deadlock-Installation ist, und liefert die kanonische Wurzel.
pub fn canonical_root(root: &Path) -> Result<PathBuf> {
    let c = dunce::canonicalize(root).map_err(|e| NativeError::Path(format!("{}: {e}", root.display())))?;
    if !c.join("game").join("citadel").is_dir() {
        return Err(NativeError::Path(format!("{} ist keine Deadlock-Installation (game/citadel fehlt)", c.display())));
    }
    Ok(c)
}

/// Löst einen erlaubten Relativpfad sicher auf. Existiert die Datei, wird sie kanonisiert und
/// muss innerhalb der Wurzel liegen (Symlink-Ausbrüche werden erkannt).
pub fn resolve(root: &Path, rel: &str, write: bool) -> Result<PathBuf> {
    let root = canonical_root(root)?;
    let rel = normalize_rel(rel)?;
    let allowed_write = WRITABLE.contains(&rel.as_str());
    let allowed_read = allowed_write || (rel.starts_with(&format!("{READABLE_CFG_DIR}/")) && rel.ends_with(".cfg") && rel.matches('/').count() == 3) || rel == "game/citadel/steam.inf";
    if write && !allowed_write {
        return Err(NativeError::Path(format!("Schreiben nicht erlaubt: {rel}")));
    }
    if !allowed_read {
        return Err(NativeError::Path(format!("Zugriff nicht erlaubt: {rel}")));
    }
    let full = root.join(&rel);
    let parent = full.parent().ok_or_else(|| NativeError::Path(rel.clone()))?;
    let cparent = dunce::canonicalize(parent).map_err(|e| NativeError::Path(format!("{}: {e}", parent.display())))?;
    if !cparent.starts_with(&root) {
        return Err(NativeError::Path(format!("Verzeichnis liegt außerhalb der Installation: {}", cparent.display())));
    }
    let target = cparent.join(full.file_name().unwrap());
    if target.exists() {
        let ct = dunce::canonicalize(&target)?;
        if !ct.starts_with(&root) {
            return Err(NativeError::Path(format!("Datei verweist außerhalb der Installation: {}", ct.display())));
        }
        return Ok(ct);
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("game/citadel/cfg")).unwrap();
        d
    }

    #[test]
    fn rejects_escapes_and_unknown_files() {
        let d = install();
        assert!(resolve(d.path(), "../etc/passwd", false).is_err());
        assert!(resolve(d.path(), "game/citadel/../../x", false).is_err());
        assert!(resolve(d.path(), "/etc/passwd", false).is_err());
        assert!(resolve(d.path(), "game/citadel/cfg/other.cfg", true).is_err());
        assert!(resolve(d.path(), "game/citadel/cfg/other.cfg", false).is_ok());
        assert!(resolve(d.path(), "game/citadel/cfg/video.txt", true).is_ok());
        assert!(resolve(d.path(), "game/bin/win64/deadlock.exe", false).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_out_of_root() {
        let d = install();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.txt"), d.path().join("game/citadel/cfg/video.txt")).unwrap();
        assert!(resolve(d.path(), "game/citadel/cfg/video.txt", true).is_err());
    }

    #[test]
    fn rejects_non_installation() {
        let d = tempfile::tempdir().unwrap();
        assert!(canonical_root(d.path()).is_err());
    }
}
