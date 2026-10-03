//! Tauri-Shell: dünne Command-Schicht über `citadel-native`.
//! Alle Dateipfade werden auf registrierte Deadlock-Installationen beschränkt.

use citadel_native::{fsops, guard, hardware, process, steam, store, NativeError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
struct AppState {
    roots: Mutex<Vec<PathBuf>>,
    startup_notes: Mutex<Vec<String>>,
}

#[derive(Debug, Serialize)]
struct CmdError {
    code: String,
    message: String,
}

impl From<NativeError> for CmdError {
    fn from(e: NativeError) -> Self {
        CmdError { code: e.code().into(), message: e.to_string() }
    }
}

fn err(code: &str, msg: impl Into<String>) -> CmdError {
    CmdError { code: code.into(), message: msg.into() }
}

type CmdResult<T> = Result<T, CmdError>;

fn data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(|e| err("io", e.to_string()))
}

fn registered_root(state: &AppState, root: &str) -> CmdResult<PathBuf> {
    let c = guard::canonical_root(Path::new(root))?;
    if state.roots.lock().unwrap().iter().any(|r| r == &c) {
        Ok(c)
    } else {
        Err(err("path", "Installation ist nicht registriert"))
    }
}

fn register(state: &AppState, root: &Path) {
    let mut r = state.roots.lock().unwrap();
    if !r.iter().any(|x| x == root) {
        r.push(root.to_path_buf());
    }
}

#[tauri::command]
fn detect_installations(state: tauri::State<AppState>) -> Vec<steam::Installation> {
    let list = steam::find_installations();
    for i in &list {
        register(&state, Path::new(&i.root));
    }
    list
}

/// Manuell gewählter Ordner: Deadlock-Wurzel oder ein Unterordner davon (…/game/citadel/cfg).
#[tauri::command]
fn register_installation(state: tauri::State<AppState>, path: String) -> CmdResult<steam::Installation> {
    let mut p = PathBuf::from(&path);
    for _ in 0..4 {
        if p.join("game").join("citadel").is_dir() {
            let lib = p.parent().and_then(|c| c.parent()).and_then(|s| s.parent()).map(|l| l.to_path_buf());
            let inst = steam::describe(&p, lib.as_deref().filter(|l| l.join("steamapps").is_dir()), "manual")?;
            register(&state, Path::new(&inst.root));
            return Ok(inst);
        }
        if !p.pop() {
            break;
        }
    }
    Err(err("path", format!("{path} ist keine Deadlock-Installation (game/citadel nicht gefunden)")))
}

#[tauri::command]
fn read_config(state: tauri::State<AppState>, root: String, rel_path: String) -> CmdResult<fsops::ReadResult> {
    let r = registered_root(&state, &root)?;
    Ok(fsops::read_file(&r, &rel_path)?)
}

#[tauri::command]
fn game_running() -> bool {
    process::is_game_running()
}

#[tauri::command]
fn apply_changes<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, req: fsops::ApplyRequest) -> CmdResult<fsops::ApplyOutcome> {
    registered_root(&state, &req.install_root)?;
    let running = process::is_game_running();
    Ok(fsops::apply(&data_dir(&app)?, &req, running)?)
}

#[tauri::command]
fn list_backups<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> CmdResult<Vec<fsops::BackupManifest>> {
    Ok(fsops::list_backups(&data_dir(&app)?)?)
}

#[tauri::command]
fn backup_text<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String, kind: String) -> CmdResult<Option<String>> {
    Ok(fsops::backup_text(&data_dir(&app)?, &id, &kind)?)
}

#[tauri::command]
fn restore_backup<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, current_build: Option<String>, kinds: Option<Vec<String>>) -> CmdResult<fsops::RestoreOutcome> {
    let data = data_dir(&app)?;
    let m = fsops::read_manifest(&data, &id)?;
    registered_root(&state, &m.install_root)?;
    Ok(fsops::restore(&data, &id, current_build.as_deref(), process::is_game_running(), kinds)?)
}

#[tauri::command]
fn snapshot_backup<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, req: fsops::SnapshotRequest) -> CmdResult<fsops::BackupManifest> {
    registered_root(&state, &req.install_root)?;
    Ok(fsops::snapshot(&data_dir(&app)?, &req)?)
}

#[tauri::command]
fn mark_backup_working<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String, how: String) -> CmdResult<()> {
    if how != "user" && how != "game-kept-values" {
        return Err(err("invalid", "unbekannte Bestätigungsart"));
    }
    Ok(fsops::mark_working(&data_dir(&app)?, &id, &how)?)
}

#[tauri::command]
async fn hardware_snapshot() -> CmdResult<hardware::Snapshot> {
    tauri::async_runtime::spawn_blocking(hardware::snapshot).await.map_err(|e| err("io", e.to_string()))
}

#[tauri::command]
fn store_put<R: tauri::Runtime>(app: tauri::AppHandle<R>, coll: String, id: String, json: String) -> CmdResult<()> {
    Ok(store::put(&data_dir(&app)?, &coll, &id, &json)?)
}
#[tauri::command]
fn store_get<R: tauri::Runtime>(app: tauri::AppHandle<R>, coll: String, id: String) -> CmdResult<Option<String>> {
    Ok(store::get(&data_dir(&app)?, &coll, &id)?)
}
#[tauri::command]
fn store_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, coll: String) -> CmdResult<Vec<String>> {
    Ok(store::list(&data_dir(&app)?, &coll)?)
}
#[tauri::command]
fn store_delete<R: tauri::Runtime>(app: tauri::AppHandle<R>, coll: String, id: String) -> CmdResult<()> {
    Ok(store::delete(&data_dir(&app)?, &coll, &id)?)
}

#[tauri::command]
fn startup_notes(state: tauri::State<AppState>) -> Vec<String> {
    state.startup_notes.lock().unwrap().clone()
}

/// Öffnet ausschließlich Windows-Einstellungsseiten (ms-settings:) bzw. den Task-Manager.
#[tauri::command]
fn open_windows_settings(uri: String) -> CmdResult<()> {
    let ok = uri == "taskmgr" || (uri.starts_with("ms-settings:") && uri[12..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    if !ok {
        return Err(err("invalid", "nicht erlaubtes Ziel"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut c = if uri == "taskmgr" {
            std::process::Command::new("taskmgr.exe")
        } else {
            let mut c = std::process::Command::new("explorer.exe");
            c.arg(&uri);
            c
        };
        c.creation_flags(0x0800_0000).spawn().map_err(|e| err("io", e.to_string()))?;
        Ok(())
    }
    #[cfg(not(windows))]
    Err(err("invalid", "Nur unter Windows verfügbar"))
}

/// Startet eine vom Nutzer bereitgestellte PresentMon-Konsolenanwendung für eine zeitlich begrenzte Aufnahme
/// von deadlock.exe und liefert die CSV. Integration ist ungetestet; Fehler werden unverändert gemeldet.
#[tauri::command]
async fn run_presentmon<R: tauri::Runtime>(app: tauri::AppHandle<R>, exe_path: String, seconds: u32) -> CmdResult<String> {
    let exe = PathBuf::from(&exe_path);
    let name = exe.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !(name.starts_with("presentmon") && name.ends_with(".exe")) || !exe.is_file() {
        return Err(err("invalid", "Bitte die PresentMon-Konsolenanwendung (PresentMon-*.exe) auswählen"));
    }
    if !(5..=600).contains(&seconds) {
        return Err(err("invalid", "Messdauer 5–600 Sekunden"));
    }
    let out_dir = data_dir(&app)?.join("captures");
    std::fs::create_dir_all(&out_dir).map_err(|e| err("io", e.to_string()))?;
    let csv = out_dir.join(format!("capture-{}.csv", citadel_native::now_iso().replace([':', '.'], "-")));
    let csv2 = csv.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&exe);
        cmd.args(["--process_name", "deadlock.exe", "--output_file"]).arg(&csv2).args(["--timed", &seconds.to_string(), "--terminate_after_timed", "--stop_existing_session"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        cmd.output()
    })
    .await
    .map_err(|e| err("io", e.to_string()))?
    .map_err(|e| err("io", format!("PresentMon konnte nicht gestartet werden: {e}")))?;
    if !csv.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(err("io", format!("Keine Messdatei erzeugt (Exit {:?}). Ausgabe: {} {}", output.status.code(), stdout.trim(), stderr.trim())));
    }
    std::fs::read_to_string(&csv).map_err(|e| err("io", e.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let state = app.state::<AppState>();
            match fsops::recover_journal(&data) {
                Ok(Some(msg)) => state.startup_notes.lock().unwrap().push(msg),
                Ok(None) => {}
                Err(e) => state.startup_notes.lock().unwrap().push(format!("Wiederherstellung eines unterbrochenen Schreibvorgangs fehlgeschlagen: {e}")),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_installations,
            register_installation,
            read_config,
            game_running,
            apply_changes,
            list_backups,
            backup_text,
            restore_backup,
            mark_backup_working,
            snapshot_backup,
            hardware_snapshot,
            store_put,
            store_get,
            store_list,
            store_delete,
            startup_notes,
            open_windows_settings,
            run_presentmon
        ])
        .run(tauri::generate_context!())
        .expect("CITADEL konnte nicht gestartet werden");
}

/// Nur für Integrationstests (tests/ipc.rs): registriert Zustand und alle dateibezogenen Commands
/// auf einem beliebigen Runtime-Builder (z. B. Tauris Mock-Runtime).
#[doc(hidden)]
pub fn with_commands_for_tests<R: tauri::Runtime>(b: tauri::Builder<R>) -> tauri::Builder<R> {
    b.manage(AppState::default()).invoke_handler(tauri::generate_handler![
        register_installation,
        read_config,
        apply_changes,
        list_backups,
        backup_text,
        restore_backup,
        mark_backup_working,
        snapshot_backup,
        store_put,
        store_get,
        store_list,
        store_delete,
        game_running
    ])
}
