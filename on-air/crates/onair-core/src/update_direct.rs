//! Direkter Update-Pfad ohne eigenen Signaturschlüssel („funktioniert sofort“).
//!
//! Vertrauensmodell: Das Manifest und das Installationspaket kommen per HTTPS von den
//! GitHub-Releases dieses Repositorys. Geprüft wird:
//! - Herkunft: Die Paket-URL muss unter demselben Release-Pfad liegen wie das Manifest
//!   (kein Download von fremden Hosts, auch nicht über ein manipuliertes Manifest).
//! - Integrität: Größe und SHA-256 aus dem Manifest, Windows-Programmkopf („MZ“).
//! - Version: nur echt neuere Versionen (kein Downgrade, keine Wiederholung).
//!
//! Das ist schwächer als eine Signatur mit eigenem Schlüssel: Wer Releases in diesem
//! Repository veröffentlichen darf, kann Updates ausliefern. Sobald ein Schlüssel
//! hinterlegt ist, nutzt die App automatisch den signierten Pfad des Tauri-Updaters.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// Obergrenze gegen unsinnig große Downloads.
pub const MAX_PACKAGE_BYTES: u64 = 300 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectRelease {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    pub_date: Option<String>,
    platforms: HashMap<String, PlatformEntry>,
}

#[derive(Deserialize)]
struct PlatformEntry {
    url: String,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

/// Schlüssel im Manifest für diese Plattform (Windows: NSIS-Paket, passend zur Installation).
pub fn platform_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-x86_64-nsis"
    } else if cfg!(target_os = "macos") {
        "darwin-universal"
    } else {
        "linux-x86_64"
    }
}

/// Erlaubter Präfix für Paket-URLs, abgeleitet vom Manifest-Endpunkt.
/// GitHub: `https://github.com/<owner>/<repo>/releases/download/`; sonst gleiche Herkunft.
pub fn allowed_prefix(endpoint: &str) -> Option<String> {
    let u = url::Url::parse(endpoint).ok()?;
    let origin = u.origin().ascii_serialization();
    let loopback = matches!(u.host_str(), Some("127.0.0.1") | Some("localhost"));
    if u.scheme() != "https" && !(u.scheme() == "http" && loopback) {
        return None;
    }
    if u.host_str() == Some("github.com") {
        let segs: Vec<&str> = u.path_segments()?.collect();
        if segs.len() >= 3 && segs[2] == "releases" {
            return Some(format!("{origin}/{}/{}/releases/download/", segs[0], segs[1]));
        }
        return None;
    }
    Some(format!("{origin}/"))
}

/// Liest das Manifest; `Ok(None)` = kein neueres Update für diese Plattform.
pub fn parse_manifest(raw: &str, current_version: &str, endpoint: &str) -> Result<Option<DirectRelease>, String> {
    let m: Manifest = serde_json::from_str(raw).map_err(|e| format!("invalid manifest json: {e}"))?;
    let remote = semver::Version::parse(m.version.trim_start_matches('v')).map_err(|e| format!("invalid manifest semver: {e}"))?;
    let current = semver::Version::parse(current_version).map_err(|e| format!("invalid current semver: {e}"))?;
    if remote <= current {
        return Ok(None);
    }
    let entry = m.platforms.get(platform_key()).or_else(|| if cfg!(target_os = "windows") { m.platforms.get("windows-x86_64") } else { None });
    let Some(entry) = entry else {
        return Err(format!("target not found in manifest: {}", platform_key()));
    };
    let prefix = allowed_prefix(endpoint).ok_or("endpoint not allowed")?;
    if !entry.url.starts_with(&prefix) || entry.url.contains("..") {
        return Err(format!("package url outside release origin: {}", entry.url));
    }
    let sha256 = entry.sha256.clone().unwrap_or_default().to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid manifest: sha256 missing".into());
    }
    let size = entry.size.filter(|s| *s > 0 && *s <= MAX_PACKAGE_BYTES).ok_or("invalid manifest: size missing")?;
    Ok(Some(DirectRelease { version: remote.to_string(), notes: m.notes, date: m.pub_date, url: entry.url.clone(), sha256, size }))
}

/// Prüft ein vollständig geladenes Paket gegen das Manifest.
pub fn verify_package(rel: &DirectRelease, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != rel.size {
        return Err(format!("package size mismatch: {} != {}", bytes.len(), rel.size));
    }
    let digest = Sha256::digest(bytes);
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    if hex != rel.sha256 {
        return Err("package checksum mismatch (sha256)".into());
    }
    if cfg!(target_os = "windows") && !bytes.starts_with(b"MZ") {
        return Err("package is not a windows executable".into());
    }
    Ok(())
}

/// Lädt das Manifest (ohne Cache, mit Zeitlimit).
pub async fn fetch_manifest(client: &reqwest::Client, endpoint: &str, current_version: &str) -> Result<Option<DirectRelease>, String> {
    let resp = client
        .get(endpoint)
        .header("Cache-Control", "no-cache")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("error sending request: {e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("release not found (404)".into());
    }
    if !resp.status().is_success() {
        return Err(format!("manifest http {}", resp.status()));
    }
    let raw = resp.text().await.map_err(|e| format!("error reading manifest: {e}"))?;
    parse_manifest(&raw, current_version, endpoint)
}

/// Lädt das Paket mit Fortschritt und prüft es vollständig, bevor es zurückgegeben wird.
pub async fn download(client: &reqwest::Client, rel: &DirectRelease, mut progress: impl FnMut(u64, Option<u64>)) -> Result<Vec<u8>, String> {
    let mut resp = client
        .get(&rel.url)
        .timeout(std::time::Duration::from_secs(600))
        .send()
        .await
        .map_err(|e| format!("error sending request: {e}"))?;
    if !resp.status().is_success() {
        return Err(if resp.status() == reqwest::StatusCode::NOT_FOUND { "package not found (404)".into() } else { format!("download http {}", resp.status()) });
    }
    let mut bytes = Vec::with_capacity(rel.size as usize);
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("download interrupted (network): {e}"))? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > rel.size {
            return Err("package larger than announced".into());
        }
        progress(bytes.len() as u64, Some(rel.size));
    }
    verify_package(rel, &bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EP: &str = "https://github.com/o/r/releases/download/on-air-stable/latest.json";

    fn manifest(version: &str, url: &str, sha: &str, size: u64) -> String {
        serde_json::json!({
            "version": version, "notes": "n", "pub_date": "2026-09-25T00:00:00Z",
            "platforms": { platform_key(): { "url": url, "signature": "", "sha256": sha, "size": size } }
        })
        .to_string()
    }

    fn sha_of(b: &[u8]) -> String {
        Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn only_newer_versions_are_offered() {
        let sha = "a".repeat(64);
        let url = "https://github.com/o/r/releases/download/on-air-v0.2.5/ON-AIR_0.2.5_x64-setup.exe";
        assert!(parse_manifest(&manifest("0.2.5", url, &sha, 10), "0.2.4", EP).unwrap().is_some());
        assert!(parse_manifest(&manifest("0.2.4", url, &sha, 10), "0.2.4", EP).unwrap().is_none());
        assert!(parse_manifest(&manifest("0.2.3", url, &sha, 10), "0.2.4", EP).unwrap().is_none());
        // Semver, nicht Zeichenkette: 0.2.10 > 0.2.9
        assert!(parse_manifest(&manifest("0.2.10", url, &sha, 10), "0.2.9", EP).unwrap().is_some());
    }

    #[test]
    fn package_must_come_from_same_release_origin() {
        let sha = "a".repeat(64);
        for bad in [
            "https://evil.example/ON-AIR.exe",
            "https://github.com/other/repo/releases/download/x/ON-AIR.exe",
            "http://github.com/o/r/releases/download/x/ON-AIR.exe",
            "https://github.com/o/r/releases/download/../../evil/ON-AIR.exe",
        ] {
            assert!(parse_manifest(&manifest("9.9.9", bad, &sha, 10), "0.2.0", EP).is_err(), "{bad}");
        }
        assert_eq!(allowed_prefix(EP).as_deref(), Some("https://github.com/o/r/releases/download/"));
        assert_eq!(allowed_prefix("http://example.com/latest.json"), None, "kein Klartext außer Loopback");
        assert_eq!(allowed_prefix("http://127.0.0.1:8765/latest.json").as_deref(), Some("http://127.0.0.1:8765/"));
    }

    #[test]
    fn checksum_and_size_are_required_and_verified() {
        let url = "https://github.com/o/r/releases/download/on-air-v1.0.0/a.exe";
        assert!(parse_manifest(&manifest("1.0.0", url, "", 10), "0.2.0", EP).is_err());
        assert!(parse_manifest(&manifest("1.0.0", url, &"a".repeat(64), 0), "0.2.0", EP).is_err());
        let body = b"MZ-test-package".to_vec();
        let rel = parse_manifest(&manifest("1.0.0", url, &sha_of(&body), body.len() as u64), "0.2.0", EP).unwrap().unwrap();
        assert!(verify_package(&rel, &body).is_ok());
        let mut tampered = body.clone();
        tampered[5] ^= 1;
        assert!(verify_package(&rel, &tampered).unwrap_err().contains("checksum"));
        assert!(verify_package(&rel, &body[..5]).unwrap_err().contains("size"));
    }
}
