//! Sicheres Lesen und Schreiben echter Nutzerdateien.
//!
//! Ablauf beim Anwenden (mehrere Dateien):
//! 1. Pfade prüfen, aktuelle Prüfsummen mit den beim Einlesen gemerkten vergleichen (Konflikt → nichts schreiben)
//! 2. Backup aller Zieldateien (mit Zeit, Build, Prüfsummen, Änderungsübersicht)
//! 3. Journal anlegen
//! 4. je Datei: temporäre Datei im selben Ordner schreiben, fsync, unmittelbar vorher erneut prüfen, ersetzen
//! 5. Zurücklesen und Prüfsumme kontrollieren
//! 6. Bei Teilfehlern: bereits geschriebene Dateien aus dem Backup zurücksetzen
//!
//! Es gibt keine systemweit atomare Mehrdatei-Transaktion; das Journal ermöglicht die Wiederherstellung
//! nach Abstürzen ([`recover_journal`]).

use crate::guard::{self, kind_of};
use crate::{now_iso, sha256_hex, NativeError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub rel_path: String,
    pub kind: Option<String>,
    pub exists: bool,
    pub text: String,
    pub bom: bool,
    /// false: Datei ist kein gültiges UTF-8 – Text ist nur eine verlustbehaftete Anzeige, Bearbeiten gesperrt.
    pub encoding_ok: bool,
    pub sha256: Option<String>,
    pub size: u64,
    pub modified: Option<String>,
}

pub fn decode(bytes: &[u8]) -> (String, bool, bool) {
    let (body, bom) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { (&bytes[3..], true) } else { (bytes, false) };
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return (String::from_utf8_lossy(bytes).into_owned(), false, false);
    }
    match std::str::from_utf8(body) {
        Ok(s) => (s.to_string(), bom, true),
        Err(_) => (String::from_utf8_lossy(body).into_owned(), bom, false),
    }
}

pub fn encode(text: &str, bom: bool) -> Vec<u8> {
    let mut v = Vec::with_capacity(text.len() + 3);
    if bom {
        v.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    v.extend_from_slice(text.as_bytes());
    v
}

pub fn read_file(root: &Path, rel: &str) -> Result<ReadResult> {
    let p = guard::resolve(root, rel, false)?;
    let rel_n = guard::normalize_rel(rel)?;
    if !p.exists() {
        return Ok(ReadResult { rel_path: rel_n.clone(), kind: kind_of(&rel_n).map(String::from), exists: false, text: String::new(), bom: false, encoding_ok: true, sha256: None, size: 0, modified: None });
    }
    let meta = fs::metadata(&p)?;
    if meta.len() > 8 * 1024 * 1024 {
        return Err(NativeError::Invalid(format!("{rel_n} ist größer als 8 MB")));
    }
    let bytes = fs::read(&p)?;
    let (text, bom, ok) = decode(&bytes);
    let modified = meta.modified().ok().map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());
    Ok(ReadResult { rel_path: rel_n.clone(), kind: kind_of(&rel_n).map(String::from), exists: true, text, bom, encoding_ok: ok, sha256: Some(sha256_hex(&bytes)), size: meta.len(), modified })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileWrite {
    pub rel_path: String,
    /// None = Datei entfernen (nur bei Wiederherstellung einer Datei, die vorher nicht existierte).
    pub text: Option<String>,
    pub bom: bool,
    /// Prüfsumme beim Einlesen; None = Datei existierte beim Einlesen nicht.
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    pub install_root: String,
    pub installation_id: String,
    pub build_id: Option<String>,
    pub change_set_id: String,
    pub reason: String,
    pub change_summary: Vec<String>,
    pub files: Vec<FileWrite>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub kind: String,
    pub rel_path: String,
    pub sha256: Option<String>,
    pub existed: bool,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Working {
    pub at: String,
    pub how: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub id: String,
    pub created_at: String,
    pub installation_id: String,
    pub install_root: String,
    pub build_id: Option<String>,
    pub reason: String,
    pub files: Vec<BackupFile>,
    pub change_summary: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working: Option<Working>,
    /// Ergebnis nach dem Anwenden (Prüfsummen der geschriebenen Dateien) – für die Spielstart-Prüfung.
    #[serde(default)]
    pub applied: Vec<BackupFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppliedFile {
    pub kind: String,
    pub rel_path: String,
    pub new_sha256: Option<String>,
    pub readback_ok: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub change_set_id: String,
    pub backup_id: String,
    pub files: Vec<AppliedFile>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Journal {
    id: String,
    backup_id: String,
    install_root: String,
    files: Vec<JournalEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    rel_path: String,
    written: bool,
}

#[cfg(test)]
thread_local! {
    static FAIL_ON: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

fn backups_dir(data: &Path) -> PathBuf {
    data.join("backups")
}
fn journal_path(data: &Path) -> PathBuf {
    data.join("journal.json")
}

fn write_atomic(target: &Path, bytes: &[u8]) -> Result<()> {
    let dir = target.parent().ok_or_else(|| NativeError::Path(target.display().to_string()))?;
    let tmp = dir.join(format!(".{}.citadel-tmp", target.file_name().unwrap().to_string_lossy()));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    // std::fs::rename ersetzt unter Windows vorhandene Dateien (MoveFileExW mit REPLACE_EXISTING).
    if let Err(e) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn write_json<T: Serialize>(p: &Path, v: &T) -> Result<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    write_atomic(p, serde_json::to_string_pretty(v).map_err(|e| NativeError::Invalid(e.to_string()))?.as_bytes())
}

fn current_sha(p: &Path) -> Result<Option<String>> {
    if !p.exists() {
        return Ok(None);
    }
    Ok(Some(sha256_hex(&fs::read(p)?)))
}

fn new_id() -> String {
    let t = chrono::Utc::now().format("%Y%m%d-%H%M%S%3f").to_string();
    let r: u32 = std::process::id() ^ (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0));
    format!("{t}-{:06x}", r & 0xFFFFFF)
}

/// Legt ein Backup der angegebenen Dateien an und liefert das Manifest.
fn create_backup(data: &Path, req: &ApplyRequest, targets: &[(String, PathBuf)]) -> Result<BackupManifest> {
    let id = new_id();
    let dir = backups_dir(data).join(&id);
    fs::create_dir_all(dir.join("files"))?;
    let mut files = Vec::new();
    for (rel, p) in targets {
        let kind = kind_of(rel).unwrap_or("andere").to_string();
        if p.exists() {
            let bytes = fs::read(p)?;
            fs::write(dir.join("files").join(&kind), &bytes)?;
            files.push(BackupFile { kind, rel_path: rel.clone(), sha256: Some(sha256_hex(&bytes)), existed: true, size: bytes.len() as u64 });
        } else {
            files.push(BackupFile { kind, rel_path: rel.clone(), sha256: None, existed: false, size: 0 });
        }
    }
    let m = BackupManifest {
        id,
        created_at: now_iso(),
        installation_id: req.installation_id.clone(),
        install_root: req.install_root.clone(),
        build_id: req.build_id.clone(),
        reason: req.reason.clone(),
        files,
        change_summary: req.change_summary.clone(),
        working: None,
        applied: vec![],
    };
    write_json(&dir.join("manifest.json"), &m)?;
    Ok(m)
}

fn restore_from_backup(data: &Path, m: &BackupManifest, root: &Path, only: Option<&[String]>) -> Result<()> {
    for f in &m.files {
        if let Some(o) = only {
            if !o.contains(&f.rel_path) {
                continue;
            }
        }
        let p = guard::resolve(root, &f.rel_path, true)?;
        if f.existed {
            let bytes = fs::read(backups_dir(data).join(&m.id).join("files").join(&f.kind))?;
            write_atomic(&p, &bytes)?;
        } else if p.exists() {
            fs::remove_file(&p)?;
        }
    }
    Ok(())
}

/// Wendet eine Menge von Dateiänderungen an (siehe Modulbeschreibung).
pub fn apply(data: &Path, req: &ApplyRequest, game_running: bool) -> Result<ApplyOutcome> {
    if game_running {
        return Err(NativeError::GameRunning);
    }
    if req.files.is_empty() {
        return Err(NativeError::Invalid("keine Änderungen".into()));
    }
    if journal_path(data).exists() {
        return Err(NativeError::Invalid("Ein unterbrochener Schreibvorgang wurde noch nicht wiederhergestellt".into()));
    }
    let root = guard::canonical_root(Path::new(&req.install_root))?;
    // 1) Pfade + Konfliktprüfung
    let mut targets = Vec::new();
    let mut conflicts = Vec::new();
    for f in &req.files {
        let rel = guard::normalize_rel(&f.rel_path)?;
        let p = guard::resolve(&root, &rel, true)?;
        if current_sha(&p)? != f.expected_sha256 {
            conflicts.push(rel.clone());
        }
        targets.push((rel, p));
    }
    if !conflicts.is_empty() {
        return Err(NativeError::Conflict(format!("Seit dem Einlesen verändert: {}", conflicts.join(", "))));
    }
    // 2) Backup
    fs::create_dir_all(data)?;
    let mut manifest = create_backup(data, req, &targets)?;
    // 3) Journal
    let mut journal = Journal { id: req.change_set_id.clone(), backup_id: manifest.id.clone(), install_root: root.display().to_string(), files: targets.iter().map(|(r, _)| JournalEntry { rel_path: r.clone(), written: false }).collect() };
    write_json(&journal_path(data), &journal)?;
    // 4) Schreiben + 5) Zurücklesen
    let mut out = Vec::new();
    let result: Result<()> = (|| {
        for (i, (f, (rel, p))) in req.files.iter().zip(targets.iter()).enumerate() {
            if current_sha(p)? != f.expected_sha256 {
                return Err(NativeError::Conflict(format!("{rel} wurde während des Schreibens verändert")));
            }
            #[cfg(test)]
            if FAIL_ON.with(|x| x.borrow().as_deref() == Some(rel.as_str())) {
                return Err(NativeError::Io(format!("simulierter Schreibfehler bei {rel}")));
            }
            let new_sha = match &f.text {
                Some(t) => {
                    let bytes = encode(t, f.bom);
                    write_atomic(p, &bytes)?;
                    Some(sha256_hex(&bytes))
                }
                None => {
                    if p.exists() {
                        fs::remove_file(p)?;
                    }
                    None
                }
            };
            journal.files[i].written = true;
            write_json(&journal_path(data), &journal)?;
            let readback = current_sha(p)?;
            if readback != new_sha {
                return Err(NativeError::Io(format!("Rücklesen von {rel} ergab eine abweichende Prüfsumme")));
            }
            out.push(AppliedFile { kind: kind_of(rel).unwrap_or("andere").into(), rel_path: rel.clone(), new_sha256: new_sha, readback_ok: true });
        }
        Ok(())
    })();
    if let Err(e) = result {
        let written: Vec<String> = journal.files.iter().filter(|j| j.written).map(|j| j.rel_path.clone()).collect();
        let rb = restore_from_backup(data, &manifest, &root, Some(&written));
        let _ = fs::remove_file(journal_path(data));
        return Err(match (e, rb) {
            (NativeError::Conflict(m), Ok(())) if written.is_empty() => NativeError::Conflict(m),
            (e, Ok(())) => NativeError::RolledBack(format!("{e}. Bereits geschriebene Dateien ({}) wurden aus dem Backup zurückgesetzt.", written.join(", "))),
            (e, Err(r)) => NativeError::Io(format!("{e}. ACHTUNG: Zurücksetzen fehlgeschlagen ({r}) – Backup {} manuell wiederherstellen.", manifest.id)),
        });
    }
    fs::remove_file(journal_path(data))?;
    manifest.applied = out.iter().map(|a| BackupFile { kind: a.kind.clone(), rel_path: a.rel_path.clone(), sha256: a.new_sha256.clone(), existed: a.new_sha256.is_some(), size: 0 }).collect();
    write_json(&backups_dir(data).join(&manifest.id).join("manifest.json"), &manifest)?;
    prune_backups(data, 100)?;
    Ok(ApplyOutcome { change_set_id: req.change_set_id.clone(), backup_id: manifest.id, files: out })
}

/// Nach einem Absturz: unvollständige Schreibvorgänge aus dem Backup zurücksetzen.
pub fn recover_journal(data: &Path) -> Result<Option<String>> {
    let jp = journal_path(data);
    if !jp.exists() {
        return Ok(None);
    }
    let j: Journal = serde_json::from_slice(&fs::read(&jp)?).map_err(|e| NativeError::Invalid(e.to_string()))?;
    let m = read_manifest(data, &j.backup_id)?;
    let root = PathBuf::from(&j.install_root);
    let all: Vec<String> = j.files.iter().map(|f| f.rel_path.clone()).collect();
    restore_from_backup(data, &m, &root, Some(&all))?;
    fs::remove_file(&jp)?;
    Ok(Some(format!("Unterbrochener Schreibvorgang {} wurde aus Backup {} zurückgesetzt.", j.id, j.backup_id)))
}

pub fn read_manifest(data: &Path, id: &str) -> Result<BackupManifest> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(NativeError::Invalid("ungültige Backup-ID".into()));
    }
    let p = backups_dir(data).join(id).join("manifest.json");
    serde_json::from_slice(&fs::read(&p)?).map_err(|e| NativeError::Invalid(e.to_string()))
}

pub fn list_backups(data: &Path) -> Result<Vec<BackupManifest>> {
    let dir = backups_dir(data);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut v = Vec::new();
    for e in fs::read_dir(dir)? {
        let e = e?;
        if let Ok(m) = read_manifest(data, &e.file_name().to_string_lossy()) {
            v.push(m);
        }
    }
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(v)
}

/// Text einer Datei aus einem Backup (für die Unterschiedsanzeige vor der Wiederherstellung).
pub fn backup_text(data: &Path, id: &str, kind: &str) -> Result<Option<String>> {
    let m = read_manifest(data, id)?;
    let f = m.files.iter().find(|f| f.kind == kind).ok_or_else(|| NativeError::Invalid(format!("{kind} nicht im Backup")))?;
    if !f.existed {
        return Ok(None);
    }
    let bytes = fs::read(backups_dir(data).join(id).join("files").join(kind))?;
    Ok(Some(decode(&bytes).0))
}

pub fn mark_working(data: &Path, id: &str, how: &str) -> Result<()> {
    let mut m = read_manifest(data, id)?;
    m.working = Some(Working { at: now_iso(), how: how.into() });
    write_json(&backups_dir(data).join(id).join("manifest.json"), &m)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRequest {
    pub install_root: String,
    pub installation_id: String,
    pub build_id: Option<String>,
    pub reason: String,
    pub rel_paths: Vec<String>,
    /// Sofort als funktionierend markieren ("user" oder "game-kept-values").
    pub working: Option<String>,
}

/// Sichert den aktuellen Stand ohne etwas zu schreiben (z. B. „bestätigt funktionierender Stand“).
pub fn snapshot(data: &Path, req: &SnapshotRequest) -> Result<BackupManifest> {
    let root = guard::canonical_root(Path::new(&req.install_root))?;
    let mut targets = Vec::new();
    for r in &req.rel_paths {
        let rel = guard::normalize_rel(r)?;
        let p = guard::resolve(&root, &rel, true)?;
        targets.push((rel, p));
    }
    let ar = ApplyRequest {
        install_root: root.display().to_string(),
        installation_id: req.installation_id.clone(),
        build_id: req.build_id.clone(),
        change_set_id: "snapshot".into(),
        reason: req.reason.clone(),
        change_summary: vec![],
        files: vec![],
    };
    let mut m = create_backup(data, &ar, &targets)?;
    if let Some(how) = &req.working {
        m.working = Some(Working { at: now_iso(), how: how.clone() });
        write_json(&backups_dir(data).join(&m.id).join("manifest.json"), &m)?;
    }
    Ok(m)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub pre_restore_backup_id: String,
    pub restored: Vec<String>,
    pub skipped: Vec<(String, String)>,
}

/// Stellt ein Backup wieder her. Vorher wird der aktuelle Stand gesichert.
/// Eine gameinfo.gi aus einem anderen Build wird nie als ganze Datei zurückkopiert.
pub fn restore(data: &Path, id: &str, current_build: Option<&str>, game_running: bool, kinds: Option<Vec<String>>) -> Result<RestoreOutcome> {
    let m = read_manifest(data, id)?;
    let root = guard::canonical_root(Path::new(&m.install_root))?;
    let mut files = Vec::new();
    let mut skipped = Vec::new();
    for f in &m.files {
        if let Some(k) = &kinds {
            if !k.contains(&f.kind) {
                continue;
            }
        }
        if f.kind == "gameinfo.gi" && (m.build_id.is_none() || current_build.is_none() || m.build_id.as_deref() != current_build) {
            skipped.push((f.rel_path.clone(), format!("Backup aus Build {:?}, installiert {:?} – nur kompatible Einzelwerte über den Anwenden-Ablauf wiederherstellbar", m.build_id, current_build)));
            continue;
        }
        let p = guard::resolve(&root, &f.rel_path, true)?;
        let text = if f.existed { Some(decode(&fs::read(backups_dir(data).join(id).join("files").join(&f.kind))?).0) } else { None };
        let bom = f.existed && fs::read(backups_dir(data).join(id).join("files").join(&f.kind))?.starts_with(&[0xEF, 0xBB, 0xBF]);
        files.push(FileWrite { rel_path: f.rel_path.clone(), text, bom, expected_sha256: current_sha(&p)? });
    }
    if files.is_empty() {
        return Err(NativeError::Invalid(format!("Nichts wiederherstellbar: {}", skipped.iter().map(|s| s.1.clone()).collect::<Vec<_>>().join("; "))));
    }
    let req = ApplyRequest {
        install_root: root.display().to_string(),
        installation_id: m.installation_id.clone(),
        build_id: current_build.map(String::from),
        change_set_id: format!("restore-{id}"),
        reason: format!("Vor Wiederherstellung von Backup {id}"),
        change_summary: vec![format!("Wiederherstellung von {id} ({})", m.reason)],
        files,
    };
    let restored: Vec<String> = req.files.iter().map(|f| f.rel_path.clone()).collect();
    let out = apply(data, &req, game_running)?;
    Ok(RestoreOutcome { pre_restore_backup_id: out.backup_id, restored, skipped })
}

fn prune_backups(data: &Path, keep: usize) -> Result<()> {
    let list = list_backups(data)?;
    for m in list.iter().skip(keep).filter(|m| m.working.is_none()) {
        let _ = fs::remove_dir_all(backups_dir(data).join(&m.id));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Env {
        install: tempfile::TempDir,
        data: tempfile::TempDir,
    }

    fn env() -> Env {
        let install = tempfile::tempdir().unwrap();
        fs::create_dir_all(install.path().join("game/citadel/cfg")).unwrap();
        fs::write(install.path().join("game/citadel/cfg/video.txt"), b"\xEF\xBB\xBF\"video.cfg\"\r\n{\r\n\t\"setting.fps_max\"\t\t\"0\"\r\n}\r\n").unwrap();
        fs::write(install.path().join("game/citadel/gameinfo.gi"), "GameInfo\n{\n}\n").unwrap();
        Env { install, data: tempfile::tempdir().unwrap() }
    }

    fn req(e: &Env, files: Vec<FileWrite>) -> ApplyRequest {
        ApplyRequest {
            install_root: e.install.path().display().to_string(),
            installation_id: "i1".into(),
            build_id: Some("100".into()),
            change_set_id: "cs1".into(),
            reason: "Test".into(),
            change_summary: vec!["fps_max 0 → 144".into()],
            files,
        }
    }

    #[test]
    fn read_keeps_bom_and_hash() {
        let e = env();
        let r = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        assert!(r.bom && r.encoding_ok && r.exists);
        assert!(r.text.starts_with("\"video.cfg\"\r\n"));
        let missing = read_file(e.install.path(), "game/citadel/cfg/autoexec.cfg").unwrap();
        assert!(!missing.exists);
    }

    #[test]
    fn apply_backup_readback_and_restore() {
        let e = env();
        let r = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        let new_text = r.text.replace("\"0\"", "\"144\"");
        let out = apply(e.data.path(), &req(&e, vec![FileWrite { rel_path: r.rel_path.clone(), text: Some(new_text.clone()), bom: true, expected_sha256: r.sha256.clone() }]), false).unwrap();
        assert!(out.files[0].readback_ok);
        let bytes = fs::read(e.install.path().join("game/citadel/cfg/video.txt")).unwrap();
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert!(String::from_utf8_lossy(&bytes).contains("\"144\"\r\n"));
        let backups = list_backups(e.data.path()).unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].files[0].sha256, r.sha256);
        assert_eq!(backup_text(e.data.path(), &out.backup_id, "video.txt").unwrap().unwrap(), r.text);
        // Wiederherstellung sichert vorher den aktuellen Stand
        let rs = restore(e.data.path(), &out.backup_id, Some("100"), false, None).unwrap();
        assert_eq!(read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap().sha256, r.sha256);
        let pre = read_manifest(e.data.path(), &rs.pre_restore_backup_id).unwrap();
        assert!(backup_text(e.data.path(), &pre.id, "video.txt").unwrap().unwrap().contains("144"));
    }

    #[test]
    fn conflict_when_file_changed_externally() {
        let e = env();
        let r = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        fs::write(e.install.path().join("game/citadel/cfg/video.txt"), "extern geändert").unwrap();
        let err = apply(e.data.path(), &req(&e, vec![FileWrite { rel_path: r.rel_path, text: Some("x".into()), bom: false, expected_sha256: r.sha256 }]), false).unwrap_err();
        assert_eq!(err.code(), "conflict");
        assert_eq!(fs::read_to_string(e.install.path().join("game/citadel/cfg/video.txt")).unwrap(), "extern geändert");
        assert!(list_backups(e.data.path()).unwrap().is_empty());
    }

    #[test]
    fn game_running_blocks_writes() {
        let e = env();
        let r = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        let err = apply(e.data.path(), &req(&e, vec![FileWrite { rel_path: r.rel_path, text: Some("x".into()), bom: false, expected_sha256: r.sha256 }]), true).unwrap_err();
        assert_eq!(err.code(), "game-running");
    }

    #[test]
    fn partial_failure_rolls_back_first_file() {
        let e = env();
        let v = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        let gi = read_file(e.install.path(), "game/citadel/gameinfo.gi").unwrap();
        FAIL_ON.with(|f| *f.borrow_mut() = Some("game/citadel/gameinfo.gi".into()));
        let files = vec![
            FileWrite { rel_path: v.rel_path.clone(), text: Some("NEU".into()), bom: false, expected_sha256: v.sha256.clone() },
            FileWrite { rel_path: gi.rel_path.clone(), text: Some("GameInfo{}".into()), bom: false, expected_sha256: gi.sha256.clone() },
        ];
        let err = apply(e.data.path(), &req(&e, files), false).unwrap_err();
        FAIL_ON.with(|f| *f.borrow_mut() = None);
        assert_eq!(err.code(), "rolled-back", "{err}");
        assert_eq!(read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap().sha256, v.sha256);
        assert_eq!(read_file(e.install.path(), "game/citadel/gameinfo.gi").unwrap().sha256, gi.sha256);
        assert!(!e.data.path().join("journal.json").exists());
    }

    #[test]
    fn journal_recovery_restores_backup() {
        let e = env();
        let v = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        let r = req(&e, vec![FileWrite { rel_path: v.rel_path.clone(), text: Some("halb".into()), bom: false, expected_sha256: v.sha256.clone() }]);
        let root = guard::canonical_root(e.install.path()).unwrap();
        let targets = vec![(v.rel_path.clone(), guard::resolve(&root, &v.rel_path, true).unwrap())];
        let m = create_backup(e.data.path(), &r, &targets).unwrap();
        // Absturz simulieren: Datei halb überschrieben, Journal liegt noch da
        fs::write(e.install.path().join("game/citadel/cfg/video.txt"), "halb").unwrap();
        write_json(&journal_path(e.data.path()), &Journal { id: "cs1".into(), backup_id: m.id.clone(), install_root: root.display().to_string(), files: vec![JournalEntry { rel_path: v.rel_path.clone(), written: true }] }).unwrap();
        let msg = recover_journal(e.data.path()).unwrap().unwrap();
        assert!(msg.contains(&m.id));
        assert_eq!(read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap().sha256, v.sha256);
    }

    #[test]
    fn old_gameinfo_not_restored_over_new_build() {
        let e = env();
        let gi = read_file(e.install.path(), "game/citadel/gameinfo.gi").unwrap();
        let out = apply(e.data.path(), &req(&e, vec![FileWrite { rel_path: gi.rel_path.clone(), text: Some("GameInfo\n{\n x 1\n}\n".into()), bom: false, expected_sha256: gi.sha256.clone() }]), false).unwrap();
        let err = restore(e.data.path(), &out.backup_id, Some("101"), false, None).unwrap_err();
        assert!(err.to_string().contains("Build"));
    }

    #[test]
    fn snapshot_marks_working_and_restores() {
        let e = env();
        let v = read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap();
        let m = snapshot(e.data.path(), &SnapshotRequest { install_root: e.install.path().display().to_string(), installation_id: "i1".into(), build_id: Some("100".into()), reason: "ok".into(), rel_paths: vec![v.rel_path.clone()], working: Some("user".into()) }).unwrap();
        assert!(m.working.is_some());
        fs::write(e.install.path().join("game/citadel/cfg/video.txt"), "kaputt").unwrap();
        restore(e.data.path(), &m.id, Some("100"), false, None).unwrap();
        assert_eq!(read_file(e.install.path(), "game/citadel/cfg/video.txt").unwrap().sha256, v.sha256);
    }

    #[test]
    fn new_file_is_removed_on_restore() {
        let e = env();
        let a = read_file(e.install.path(), "game/citadel/cfg/autoexec.cfg").unwrap();
        let out = apply(e.data.path(), &req(&e, vec![FileWrite { rel_path: a.rel_path.clone(), text: Some("sensitivity 1\n".into()), bom: false, expected_sha256: None }]), false).unwrap();
        assert!(e.install.path().join("game/citadel/cfg/autoexec.cfg").exists());
        restore(e.data.path(), &out.backup_id, Some("100"), false, None).unwrap();
        assert!(!e.install.path().join("game/citadel/cfg/autoexec.cfg").exists());
    }
}
