//! Einfache lokale Dokumentablage für Profile, Messungen und App-Einstellungen.
//! Jede Sammlung ist ein Ordner, jedes Dokument eine JSON-Datei (atomar geschrieben).

use crate::{NativeError, Result};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const COLLECTIONS: &[&str] = &["profiles", "benchmarks", "settings", "install-state", "crosshairs", "players-cache", "screenshots-meta"];

fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn doc_path(data: &Path, coll: &str, id: &str) -> Result<PathBuf> {
    if !COLLECTIONS.contains(&coll) {
        return Err(NativeError::Invalid(format!("unbekannte Sammlung {coll}")));
    }
    if !valid_id(id) {
        return Err(NativeError::Invalid(format!("ungültige ID {id}")));
    }
    Ok(data.join("store").join(coll).join(format!("{id}.json")))
}

pub fn put(data: &Path, coll: &str, id: &str, json: &str) -> Result<()> {
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| NativeError::Invalid(format!("kein JSON: {e}")))?;
    if json.len() > 5 * 1024 * 1024 {
        return Err(NativeError::Invalid("Dokument zu groß".into()));
    }
    let p = doc_path(data, coll, id)?;
    fs::create_dir_all(p.parent().unwrap())?;
    let tmp = p.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(tmp, p)?;
    Ok(())
}

pub fn get(data: &Path, coll: &str, id: &str) -> Result<Option<String>> {
    let p = doc_path(data, coll, id)?;
    if !p.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(p)?))
}

pub fn list(data: &Path, coll: &str) -> Result<Vec<String>> {
    doc_path(data, coll, "x")?;
    let dir = data.join("store").join(coll);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for e in fs::read_dir(dir)?.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if let Some(id) = n.strip_suffix(".json") {
            if valid_id(id) {
                out.push(fs::read_to_string(e.path())?);
            }
        }
    }
    Ok(out)
}

pub fn delete(data: &Path, coll: &str, id: &str) -> Result<()> {
    let p = doc_path(data, coll, id)?;
    if p.exists() {
        fs::remove_file(p)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_validation() {
        let d = tempfile::tempdir().unwrap();
        put(d.path(), "profiles", "p_1", "{\"a\":1}").unwrap();
        assert_eq!(get(d.path(), "profiles", "p_1").unwrap().unwrap(), "{\"a\":1}");
        assert_eq!(list(d.path(), "profiles").unwrap().len(), 1);
        assert!(put(d.path(), "profiles", "../x", "{}").is_err());
        assert!(put(d.path(), "nope", "x", "{}").is_err());
        assert!(put(d.path(), "profiles", "x", "kein json").is_err());
        delete(d.path(), "profiles", "p_1").unwrap();
        assert!(get(d.path(), "profiles", "p_1").unwrap().is_none());
    }
}
