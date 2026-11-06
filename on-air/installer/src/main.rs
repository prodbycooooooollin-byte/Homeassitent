//! ON AIR Setup – eigene, immersive Installationsoberfläche.
//!
//! Die eigentliche Installation erledigt das eingebettete NSIS-Paket der App (dasselbe, das
//! auch der Updater nutzt): Deinstallation, Startmenü, Registrierung und Updates bleiben damit
//! identisch zur Standardinstallation. Diese Oberfläche startet es still (`/S`) und zeigt den
//! Fortschritt. Fehlt WebView2 (sehr alte Windows-Versionen), öffnet sich direkt der klassische
//! Installer, der WebView2 selbst nachlädt.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));
const VERSION: &str = match option_env!("ONAIR_SETUP_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),
};
const UNINSTALL_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ON AIR";
const DEFAULT_BINARY: &str = "onair-desktop.exe";

#[derive(Serialize)]
struct Installed {
    version: Option<String>,
    location: Option<String>,
}

#[derive(Serialize)]
struct SetupInfo {
    version: &'static str,
    payload_ok: bool,
    payload_mb: f64,
    installed: Option<Installed>,
    app_running: bool,
    platform_ok: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    percent: f64,
}

/// Wert aus der Registrierung (über `reg query`, ohne zusätzliche Abhängigkeiten).
fn reg_value(name: &str) -> Option<String> {
    if !cfg!(windows) {
        return None;
    }
    let out = hidden(Command::new("reg").args(["query", UNINSTALL_KEY, "/v", name])).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.trim_start().starts_with(name))?;
    let value = line.split("REG_SZ").nth(1)?.trim().trim_matches('"').to_string();
    (!value.is_empty()).then_some(value)
}

fn installed() -> Option<Installed> {
    let version = reg_value("DisplayVersion");
    let location = reg_value("InstallLocation");
    (version.is_some() || location.is_some()).then_some(Installed { version, location })
}

fn main_binary() -> String {
    reg_value("MainBinaryName").unwrap_or_else(|| DEFAULT_BINARY.into())
}

fn app_running() -> bool {
    if !cfg!(windows) {
        return false;
    }
    let bin = main_binary();
    hidden(Command::new("tasklist").args(["/FI", &format!("IMAGENAME eq {bin}"), "/NH"]))
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains(&bin.to_lowercase()))
        .unwrap_or(false)
}

/// Kein aufblitzendes Konsolenfenster für Hilfsprogramme.
fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

fn write_payload() -> Result<PathBuf, String> {
    if PAYLOAD.len() < 2 || !PAYLOAD.starts_with(b"MZ") {
        return Err("Das Installationspaket fehlt in diesem Build.".into());
    }
    let dir = std::env::temp_dir().join("ON-AIR-Setup");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("ON-AIR_{VERSION}_x64-setup.exe"));
    std::fs::write(&path, PAYLOAD).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
fn setup_info() -> SetupInfo {
    SetupInfo {
        version: VERSION,
        payload_ok: PAYLOAD.starts_with(b"MZ"),
        payload_mb: (PAYLOAD.len() as f64 / 1_048_576.0 * 10.0).round() / 10.0,
        installed: installed(),
        app_running: app_running(),
        platform_ok: cfg!(windows),
    }
}

/// Installiert still. Der Fortschritt ist geschätzt (NSIS meldet im stillen Modus keinen),
/// das Ergebnis dagegen echt: Exit-Code des Installers plus Kontrolle der Registrierung.
#[tauri::command]
async fn install(app: AppHandle, desktop_shortcut: bool) -> Result<Option<String>, String> {
    if !cfg!(windows) {
        return Err("Die Installation ist nur unter Windows möglich.".into());
    }
    let emit = |phase: &'static str, percent: f64| {
        let _ = app.emit("setup://progress", Progress { phase, percent });
    };
    emit("prepare", 4.0);
    let path = write_payload()?;
    emit("install", 10.0);
    let mut args = vec!["/S"];
    if !desktop_shortcut {
        args.push("/NS");
    }
    let mut child = Command::new(&path).args(&args).spawn().map_err(|e| format!("Installer konnte nicht gestartet werden: {e}"))?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        // Annäherung an 92 %: ~25 s typische Dauer, danach sehr langsam weiter.
        let t = started.elapsed().as_secs_f64();
        let pct = 10.0 + 82.0 * (1.0 - (-t / 9.0).exp());
        emit(if t < 4.0 { "extract" } else if t < 12.0 { "install" } else { "finish" }, pct);
        if started.elapsed() > Duration::from_secs(600) {
            let _ = child.kill();
            return Err("Die Installation hat zu lange gedauert und wurde abgebrochen.".into());
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    };
    let _ = std::fs::remove_file(&path);
    if !status.success() {
        return Err(format!("Der Installer meldet einen Fehler (Code {}).", status.code().unwrap_or(-1)));
    }
    emit("done", 100.0);
    Ok(installed().and_then(|i| i.version))
}

/// Startet die installierte App (nicht erhöht, normaler Benutzerprozess).
#[tauri::command]
fn launch() -> Result<(), String> {
    let loc = installed().and_then(|i| i.location).ok_or("ON AIR wurde nicht gefunden.")?;
    let exe = PathBuf::from(loc.trim_matches('"')).join(main_binary());
    Command::new(&exe).spawn().map_err(|e| format!("ON AIR konnte nicht gestartet werden: {e}"))?;
    Ok(())
}

/// Notausgang: klassischen Installer mit eigener Oberfläche öffnen.
#[tauri::command]
fn classic() -> Result<(), String> {
    let path = write_payload()?;
    Command::new(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    // Ohne WebView2 kann diese Oberfläche nicht erscheinen → klassischer Installer.
    if cfg!(windows) && tauri::webview_version().is_err() {
        if let Ok(path) = write_payload() {
            let _ = Command::new(path).spawn();
        }
        return;
    }
    tauri::Builder::default()
        // Fenster erst zeigen, wenn die Oberfläche geladen ist (kein weißes Aufblitzen).
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        .invoke_handler(tauri::generate_handler![setup_info, install, launch, classic])
        .run(tauri::generate_context!())
        .expect("ON AIR Setup konnte nicht starten");
}
