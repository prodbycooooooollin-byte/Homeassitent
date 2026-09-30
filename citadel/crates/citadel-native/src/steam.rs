//! Steam-Bibliotheken und Deadlock-Installationen finden (mehrere Laufwerke, mehrere Bibliotheken).
//! Bei mehreren Treffern wird nichts stillschweigend gewählt – die UI fragt nach.

use crate::{guard, sha256_hex, vdf, Result, DEADLOCK_APP_ID};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallFile {
    pub kind: String,
    pub rel_path: String,
    pub exists: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub root: String,
    pub library_path: Option<String>,
    pub app_id: u32,
    pub build_id: Option<String>,
    /// Aus game/citadel/steam.inf (PatchVersion/ClientVersion), falls vorhanden.
    pub patch_version: Option<String>,
    pub last_updated: Option<String>,
    pub detected_via: String,
    pub files: Vec<InstallFile>,
    pub other_cfgs: Vec<String>,
}

/// Mögliche Steam-Wurzeln (Registry unter Windows, Standardpfade sonst).
pub fn steam_roots() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        if let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(p) = k.get_value::<String, _>("SteamPath") {
                v.push(PathBuf::from(p.replace('/', "\\")));
            }
        }
        for sub in ["SOFTWARE\\WOW6432Node\\Valve\\Steam", "SOFTWARE\\Valve\\Steam"] {
            if let Ok(k) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(sub) {
                if let Ok(p) = k.get_value::<String, _>("InstallPath") {
                    v.push(PathBuf::from(p));
                }
            }
        }
        v.push(PathBuf::from("C:\\Program Files (x86)\\Steam"));
    }
    #[cfg(not(windows))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let h = PathBuf::from(home);
            v.push(h.join(".steam/steam"));
            v.push(h.join(".local/share/Steam"));
        }
    }
    let mut out: Vec<PathBuf> = Vec::new();
    for p in v {
        if let Ok(c) = dunce::canonicalize(&p) {
            if !out.contains(&c) {
                out.push(c);
            }
        }
    }
    out
}

/// Bibliotheksordner aus steamapps/libraryfolders.vdf.
pub fn libraries(steam_root: &Path) -> Vec<PathBuf> {
    let mut libs = vec![steam_root.to_path_buf()];
    if let Ok(src) = fs::read_to_string(steam_root.join("steamapps").join("libraryfolders.vdf")) {
        let kv = vdf::parse(&src);
        if let Some(lf) = kv.get("libraryfolders") {
            for (_, entry) in lf.entries() {
                if let Some(p) = entry.get("path").and_then(|p| p.str()) {
                    let pb = PathBuf::from(p);
                    if !libs.contains(&pb) {
                        libs.push(pb);
                    }
                }
            }
        }
    }
    libs
}

fn read_steam_inf(root: &Path) -> Option<String> {
    let s = fs::read_to_string(root.join("game/citadel/steam.inf")).ok()?;
    let mut patch = None;
    let mut client = None;
    for line in s.lines() {
        if let Some((k, v)) = line.split_once('=') {
            match k.trim().to_lowercase().as_str() {
                "patchversion" => patch = Some(v.trim().to_string()),
                "clientversion" => client = Some(v.trim().to_string()),
                _ => {}
            }
        }
    }
    patch.or(client)
}

/// Beschreibt eine Installation (Dateien, Build). `root` muss game/citadel enthalten.
pub fn describe(root: &Path, library: Option<&Path>, via: &str) -> Result<Installation> {
    let root = guard::canonical_root(root)?;
    let mut build_id = None;
    let mut last_updated = None;
    if let Some(lib) = library {
        if let Ok(src) = fs::read_to_string(lib.join("steamapps").join(format!("appmanifest_{DEADLOCK_APP_ID}.acf"))) {
            let kv = vdf::parse(&src);
            if let Some(st) = kv.get("AppState") {
                build_id = st.get("buildid").and_then(|v| v.str()).map(String::from);
                last_updated = st
                    .get("LastUpdated")
                    .and_then(|v| v.str())
                    .and_then(|s| s.parse::<i64>().ok())
                    .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
                    .map(|d| d.to_rfc3339());
            }
        }
    }
    let files = guard::WRITABLE
        .iter()
        .map(|rel| InstallFile { kind: guard::kind_of(rel).unwrap().to_string(), rel_path: rel.to_string(), exists: root.join(rel).exists() })
        .collect();
    let mut other_cfgs = Vec::new();
    if let Ok(rd) = fs::read_dir(root.join(guard::READABLE_CFG_DIR)) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".cfg") && n != "autoexec.cfg" {
                other_cfgs.push(format!("{}/{n}", guard::READABLE_CFG_DIR));
            }
        }
    }
    other_cfgs.sort();
    Ok(Installation {
        id: sha256_hex(root.display().to_string().to_lowercase().as_bytes())[..16].to_string(),
        root: root.display().to_string(),
        library_path: library.map(|l| l.display().to_string()),
        app_id: DEADLOCK_APP_ID,
        build_id,
        patch_version: read_steam_inf(&root),
        last_updated,
        detected_via: via.into(),
        files,
        other_cfgs,
    })
}

/// Alle gefundenen Deadlock-Installationen über alle Steam-Bibliotheken.
pub fn find_installations() -> Vec<Installation> {
    let mut out: Vec<Installation> = Vec::new();
    for sr in steam_roots() {
        for lib in libraries(&sr) {
            let manifest = lib.join("steamapps").join(format!("appmanifest_{DEADLOCK_APP_ID}.acf"));
            let installdir = fs::read_to_string(&manifest)
                .ok()
                .and_then(|s| vdf::parse(&s).path(&["AppState", "installdir"]).and_then(|v| v.str()).map(String::from))
                .unwrap_or_else(|| "Deadlock".into());
            let root = lib.join("steamapps").join("common").join(installdir);
            if root.join("game").join("citadel").is_dir() {
                if let Ok(i) = describe(&root, Some(&lib), "steam-library") {
                    if !out.iter().any(|x| x.id == i.id) {
                        out.push(i);
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_installation_with_manifest() {
        let lib = tempfile::tempdir().unwrap();
        let root = lib.path().join("steamapps/common/Deadlock");
        fs::create_dir_all(root.join("game/citadel/cfg")).unwrap();
        fs::write(root.join("game/citadel/cfg/video.txt"), "x").unwrap();
        fs::write(root.join("game/citadel/cfg/machine_convars.cfg"), "x").unwrap();
        fs::write(root.join("game/citadel/steam.inf"), "ClientVersion=6012\nPatchVersion=1.0.0.6012\n").unwrap();
        fs::write(lib.path().join("steamapps/appmanifest_1422450.acf"), "\"AppState\"\n{\n\t\"appid\"\t\t\"1422450\"\n\t\"installdir\"\t\t\"Deadlock\"\n\t\"LastUpdated\"\t\t\"1759200000\"\n\t\"buildid\"\t\t\"20111222\"\n}\n").unwrap();
        let i = describe(&root, Some(lib.path()), "steam-library").unwrap();
        assert_eq!(i.build_id.as_deref(), Some("20111222"));
        assert_eq!(i.patch_version.as_deref(), Some("1.0.0.6012"));
        assert!(i.files.iter().any(|f| f.kind == "video.txt" && f.exists));
        assert!(i.files.iter().any(|f| f.kind == "autoexec.cfg" && !f.exists));
        assert_eq!(i.other_cfgs, vec!["game/citadel/cfg/machine_convars.cfg".to_string()]);
        assert!(i.last_updated.unwrap().starts_with("2025-09-30"));
    }
}
