//! Tauri-Befehle. Dünne Schicht: Fachlogik liegt in `onair-core`.

use crate::AppState;
use onair_core::auth::loopback::LoginError;
use onair_core::diagnostics::{self, Check};
use onair_core::error::ApiError;
use onair_core::model::{Device, Track};
use onair_core::queue::store::{BlockEntry, HistoryEntry};
use onair_core::queue::SubmitOutcome;
use onair_core::runtime::AppSnapshot;
use onair_core::settings::{CloseBehavior, Settings};
use onair_core::twitch::auth::DeviceCode;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
pub struct CmdError {
    pub code: String,
    pub message: String,
}

impl From<ApiError> for CmdError {
    fn from(e: ApiError) -> Self {
        Self { code: e.code().into(), message: e.to_string() }
    }
}

impl From<String> for CmdError {
    fn from(message: String) -> Self {
        Self { code: "error".into(), message }
    }
}

impl From<&str> for CmdError {
    fn from(message: &str) -> Self {
        Self { code: "error".into(), message: message.into() }
    }
}

impl From<LoginError> for CmdError {
    fn from(e: LoginError) -> Self {
        let code = match &e {
            LoginError::PortInUse { .. } => "port_in_use",
            LoginError::Timeout => "login_timeout",
            LoginError::Cancelled => "login_cancelled",
            LoginError::Denied { .. } => "login_denied",
            LoginError::StateMismatch => "state_mismatch",
            LoginError::Exchange { .. } => "token_exchange",
            LoginError::Other { .. } => "login_failed",
        };
        Self { code: code.into(), message: e.to_string() }
    }
}

type R<T> = Result<T, CmdError>;

#[tauri::command]
pub async fn get_snapshot(state: State<'_, AppState>) -> R<AppSnapshot> {
    Ok(state.rt.snapshot().await)
}

#[tauri::command]
pub async fn spotify_login(app: AppHandle, state: State<'_, AppState>) -> R<()> {
    let opener = app.clone();
    state
        .rt
        .spotify_login(move |url| opener.opener().open_url(url, None::<&str>).map_err(|e| e.to_string()))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn spotify_cancel_login(state: State<'_, AppState>) {
    state.rt.cancel_spotify_login();
}

#[tauri::command]
pub fn spotify_logout(state: State<'_, AppState>) {
    state.rt.spotify_logout();
}

#[tauri::command]
pub async fn twitch_login_start(app: AppHandle, state: State<'_, AppState>) -> R<DeviceCode> {
    let dc = state.rt.twitch_login_start().await?;
    // Aktivierungsseite öffnen; der Code wird zusätzlich in der App angezeigt.
    let _ = app.opener().open_url(&dc.verification_uri, None::<&str>);
    Ok(dc)
}

#[tauri::command]
pub fn twitch_login_cancel(state: State<'_, AppState>) {
    state.rt.twitch_login_cancel();
}

#[tauri::command]
pub fn twitch_logout(state: State<'_, AppState>) {
    state.rt.twitch_logout();
}

#[tauri::command]
pub async fn transport(state: State<'_, AppState>, action: String) -> R<()> {
    state.rt.transport(&action).await.map_err(Into::into)
}

#[tauri::command]
pub async fn list_devices(state: State<'_, AppState>) -> R<Vec<Device>> {
    state.rt.devices().await.map_err(Into::into)
}

#[tauri::command]
pub async fn transfer_playback(state: State<'_, AppState>, device_id: String) -> R<()> {
    state.rt.transfer_playback(&device_id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn search(state: State<'_, AppState>, query: String) -> R<Vec<Track>> {
    state.rt.search(&query).await.map_err(Into::into)
}

#[tauri::command]
pub async fn add_request(state: State<'_, AppState>, track: Track) -> R<SubmitOutcome> {
    Ok(state.rt.add_request(track).await)
}

#[tauri::command]
pub async fn queue_action(state: State<'_, AppState>, action: String, id: String, index: Option<usize>) -> R<()> {
    let q = &state.rt.queue;
    match action.as_str() {
        "approve" => q.approve(&id).await?,
        "reject" => q.reject_manual(&id, "rejected_by_streamer")?,
        "remove" => q.reject_manual(&id, "removed_by_streamer")?,
        "move" => q.move_to(&id, index.unwrap_or(0))?,
        "prioritize" => q.set_priority(&id, true)?,
        "unprioritize" => q.set_priority(&id, false)?,
        "retry" => q.retry(&id).await?,
        "dismiss" => q.dismiss(&id)?,
        _ => return Err("unbekannte Aktion".into()),
    }
    Ok(())
}

#[tauri::command]
pub async fn set_requests_open(state: State<'_, AppState>, open: bool) -> R<()> {
    state.rt.set_requests_open(open).await.map_err(Into::into)
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> R<Settings> {
    let s = state.rt.update_settings(settings).await?;
    crate::apply_hotkey(&app, &s.hotkey_skip);
    Ok(s)
}

#[tauri::command]
pub fn export_settings(state: State<'_, AppState>) -> String {
    state.rt.export_settings()
}

#[tauri::command]
pub async fn import_settings(state: State<'_, AppState>, raw: String) -> R<Settings> {
    state.rt.import_settings(&raw).await.map_err(Into::into)
}

#[tauri::command]
pub async fn profile_action(state: State<'_, AppState>, action: String, id: Option<String>, name: Option<String>) -> R<()> {
    let rt = &state.rt;
    match action.as_str() {
        "save" => rt.save_profile(name.as_deref().unwrap_or("Profil")).await?,
        "apply" => rt.apply_profile(id.as_deref().unwrap_or("")).await?,
        "update" => rt.update_profile_from_current(id.as_deref().unwrap_or("")).await?,
        "delete" => rt.delete_profile(id.as_deref().unwrap_or("")).await?,
        _ => return Err("unbekannte Aktion".into()),
    }
    Ok(())
}

#[tauri::command]
pub fn blocklist_list(state: State<'_, AppState>) -> Vec<BlockEntry> {
    state.rt.blocklist()
}

#[tauri::command]
pub fn blocklist_add(state: State<'_, AppState>, kind: String, value: String, label: String) -> R<()> {
    state.rt.add_block(&kind, &value, &label).map_err(Into::into)
}

#[tauri::command]
pub fn blocklist_remove(state: State<'_, AppState>, kind: String, value: String) -> R<()> {
    state.rt.remove_block(&kind, &value).map_err(Into::into)
}

#[tauri::command]
pub fn history(state: State<'_, AppState>, search: String, limit: Option<u32>) -> Vec<HistoryEntry> {
    state.rt.history(&search, limit.unwrap_or(200))
}

#[tauri::command]
pub async fn run_diagnostics(state: State<'_, AppState>, target: String) -> R<Vec<Check>> {
    Ok(diagnostics::run(&state.rt, &target).await)
}

#[tauri::command]
pub async fn diagnostics_export(state: State<'_, AppState>) -> R<serde_json::Value> {
    Ok(diagnostics::export(&state.rt).await)
}

/// Schreibt Export-Dateien an einen im Speichern-Dialog gewählten Ort.
#[tauri::command]
pub fn write_export_file(path: String, content: String) -> R<()> {
    let p = std::path::PathBuf::from(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !matches!(ext.as_str(), "json" | "txt") {
        return Err("Nur .json- oder .txt-Dateien".into());
    }
    std::fs::write(&p, content).map_err(|e| CmdError::from(e.to_string()))
}

#[tauri::command]
pub fn read_import_file(path: String) -> R<String> {
    let p = std::path::PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| CmdError::from(e.to_string()))?;
    if meta.len() > 2_000_000 {
        return Err("Datei zu groß".into());
    }
    std::fs::read_to_string(&p).map_err(|e| CmdError::from(e.to_string()))
}

/// Öffnet nur bekannte HTTPS-Ziele im Systembrowser.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> R<()> {
    let allowed = [
        "https://developer.spotify.com/",
        "https://dev.twitch.tv/",
        "https://www.twitch.tv/activate",
        "https://open.spotify.com/",
        "https://obsproject.com/",
    ];
    if !allowed.iter().any(|a| url.starts_with(a)) {
        return Err("Ziel nicht erlaubt".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| CmdError::from(e.to_string()))
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> R<()> {
    let dir = crate::logs_dir(&app).ok_or("Kein Log-Ordner")?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| CmdError::from(e.to_string()))
}

#[tauri::command]
pub fn get_control_token(state: State<'_, AppState>) -> String {
    state.rt.control_token().to_string()
}

#[tauri::command]
pub fn set_ui_visible(state: State<'_, AppState>, visible: bool) {
    state.rt.set_ui_visible(visible);
}

/// Muss `async` sein: Unter Windows blockiert das Erzeugen eines Fensters aus einem
/// synchronen Befehl (Haupt-Thread) dauerhaft – graues, nicht schließbares Fenster,
/// danach hängen alle weiteren Befehle (WebView2-Einschränkung, siehe Tauri-Doku).
#[tauri::command]
pub async fn open_compact(app: AppHandle) -> R<()> {
    crate::open_compact(&app).map_err(|e| CmdError::from(e.to_string()))
}

/// Antwort auf den Erklärdialog beim ersten Schließen.
#[tauri::command]
pub async fn close_action(app: AppHandle, state: State<'_, AppState>, action: String, remember: bool) -> R<()> {
    if remember {
        let mut s = onair_core::settings::read(&state.rt.settings).clone();
        s.close_behavior = if action == "quit" { CloseBehavior::Quit } else { CloseBehavior::Tray };
        state.rt.update_settings(s).await?;
    }
    if action == "quit" {
        crate::quit(&app);
    } else if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
        state.rt.set_ui_visible(false);
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit(&app);
}

// ---------------- Streamplanung ----------------

#[tauri::command]
pub fn plan_set_end(state: State<'_, AppState>, end_at_ms: i64, buffer_ms: Option<i64>) -> R<()> {
    state.rt.plan_set_end(end_at_ms, buffer_ms).map_err(Into::into)
}

#[tauri::command]
pub fn plan_extend(state: State<'_, AppState>, minutes: i64) -> R<()> {
    state.rt.plan_extend(minutes).map_err(Into::into)
}

#[tauri::command]
pub fn plan_set_buffer(state: State<'_, AppState>, buffer_ms: i64) -> R<()> {
    state.rt.plan_set_buffer(buffer_ms).map_err(Into::into)
}

#[tauri::command]
pub fn plan_stop(state: State<'_, AppState>) -> R<()> {
    state.rt.plan_stop().map_err(Into::into)
}

// ---------------- Kanalpunkte ----------------

#[tauri::command]
pub fn redemption_decide(state: State<'_, AppState>, id: String, fulfill: bool) -> R<()> {
    state.rt.redemption_decide(&id, fulfill).map_err(Into::into)
}

// ---------------- Updates ----------------

type Updates<'a> = State<'a, std::sync::Arc<crate::updater::UpdateManager>>;

#[tauri::command]
pub fn update_info(app: AppHandle, updates: Updates<'_>) -> crate::updater::UpdateInfo {
    updates.info(&app)
}

#[tauri::command]
pub async fn update_check(app: AppHandle, updates: Updates<'_>) -> R<crate::updater::UpdateInfo> {
    updates.check(&app).await.map_err(Into::into)
}

/// Startet den Download im Hintergrund; Fortschritt kommt über `onair://update`.
#[tauri::command]
pub fn update_download(app: AppHandle, updates: Updates<'_>) -> R<()> {
    let st = updates.info(&app).state;
    st.can_download().map_err(|e| CmdError::from(e.to_string()))?;
    let m = updates.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _ = m.download(&app).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn update_preflight(state: State<'_, AppState>, updates: Updates<'_>) -> R<crate::updater::Preflight> {
    Ok(updates.preflight(&state.rt).await)
}

#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, AppState>, updates: Updates<'_>) -> R<onair_core::runtime::UpdatePrep> {
    updates.install(&app, state.rt.clone()).await.map_err(Into::into)
}

#[tauri::command]
pub fn update_later(app: AppHandle, updates: Updates<'_>) {
    updates.later(&app);
}

/// „Nicht jetzt“ im Countdown der automatischen Installation.
#[tauri::command]
pub fn update_postpone(app: AppHandle, updates: Updates<'_>) {
    updates.postpone(&app);
}
