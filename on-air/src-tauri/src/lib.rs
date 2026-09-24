//! ON AIR Desktop-Hülle: Fenster, Tray, Autostart, Einzelinstanz, Logging.

mod commands;
mod keyring_store;
mod updater;

use onair_core::clock::SystemClock;
use onair_core::events::AppEvent;
use onair_core::http::ReqwestTransport;
use onair_core::runtime::{Endpoints, Runtime, RuntimeConfig};
use onair_core::settings::{self as cfg, CloseBehavior};
use onair_core::storage::Db;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub struct AppState {
    pub rt: Arc<Runtime>,
}

pub(crate) static QUITTING: AtomicBool = AtomicBool::new(false);

pub(crate) fn logs_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_log_dir().ok()
}

fn init_logging(dir: &PathBuf) -> Option<tracing_appender::non_blocking::WorkerGuard> {
    use tracing_subscriber::prelude::*;
    std::fs::create_dir_all(dir).ok()?;
    // Tägliche Rotation, höchstens 7 Dateien. Logs enthalten keine Tokens,
    // Authorization-Header oder Callback-URLs (siehe onair-core).
    let appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("onair")
        .filename_suffix("log")
        .max_log_files(7)
        .build(dir)
        .ok()?;
    let (writer, guard) = tracing_appender::non_blocking(appender);
    let filter = tracing_subscriber::EnvFilter::try_from_env("ONAIR_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,hyper=warn,reqwest=warn,tungstenite=warn,tokio_tungstenite=warn"));
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_writer(writer).with_ansi(false).with_target(true))
        .try_init();
    std::panic::set_hook(Box::new(|info| {
        tracing::error!(target: "panic", "{info}");
    }));
    Some(guard)
}

pub(crate) fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(s) = app.try_state::<AppState>() {
        s.rt.set_ui_visible(true);
    }
}

pub(crate) fn open_compact(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("compact") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let on_top = app
        .try_state::<AppState>()
        .map(|s| cfg::read(&s.rt.settings).compact_on_top)
        .unwrap_or(true);
    WebviewWindowBuilder::new(app, "compact", WebviewUrl::App("index.html#/compact".into()))
        .title("ON AIR – Kompakt")
        .inner_size(380.0, 560.0)
        .min_inner_size(320.0, 380.0)
        .always_on_top(on_top)
        .background_color(tauri::window::Color(16, 17, 20, 255))
        .build()?;
    Ok(())
}

pub(crate) fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    if let Some(s) = app.try_state::<AppState>() {
        let rt = s.rt.clone();
        tauri::async_runtime::block_on(async move { rt.shutdown().await });
    }
    app.exit(0);
}

pub(crate) fn apply_hotkey(app: &AppHandle, spec: &str) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let spec = spec.trim();
    if spec.is_empty() {
        return;
    }
    // Nur dieser eine Hotkey wird registriert – keine globale Tastaturaufzeichnung.
    if let Err(e) = gs.register(spec) {
        tracing::warn!(target: "hotkey", error = %e, "Hotkey nicht registriert");
        if let Some(s) = app.try_state::<AppState>() {
            s.rt.activity.warn("hotkey.failed", format!("Hotkey „{spec}“ konnte nicht registriert werden"), serde_json::json!({}));
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "ON AIR öffnen", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle_requests", "Requests öffnen", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Song überspringen", true, None::<&str>)?;
    let compact = MenuItem::with_id(app, "compact", "Kompaktmodus", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "ON AIR beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &toggle, &skip, &compact, &PredefinedMenuItem::separator(app)?, &quit_i])?;
    let toggle_ref = toggle.clone();
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("icon"))
        .tooltip("ON AIR")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let app = app.clone();
            match event.id.as_ref() {
                "open" => show_main(&app),
                "compact" => {
                    let _ = open_compact(&app);
                }
                "quit" => quit(&app),
                "skip" => {
                    if let Some(s) = app.try_state::<AppState>() {
                        let rt = s.rt.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = rt.transport("next").await;
                        });
                    }
                }
                "toggle_requests" => {
                    if let Some(s) = app.try_state::<AppState>() {
                        let rt = s.rt.clone();
                        tauri::async_runtime::spawn(async move {
                            let open = cfg::read(&rt.settings).requests.open;
                            let _ = rt.set_requests_open(!open).await;
                        });
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    // Menütext des Request-Schalters aktuell halten.
    app.manage(TrayItems { toggle: toggle_ref });
    Ok(())
}

struct TrayItems {
    toggle: MenuItem<tauri::Wry>,
}

/// Leitet Änderungen gebündelt an alle Fenster weiter und aktualisiert den Tray.
fn spawn_emitter(app: AppHandle, rt: Arc<Runtime>) {
    tauri::async_runtime::spawn(async move {
        let mut rx = rt.bus.subscribe();
        loop {
            match rx.recv().await {
                Ok(AppEvent::Changed { .. }) | Ok(AppEvent::Activity(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => return,
            }
            // Kurz sammeln, dann einen Snapshot senden.
            tokio::time::sleep(Duration::from_millis(120)).await;
            while rx.try_recv().is_ok() {}
            let snap = rt.snapshot().await;
            let _ = app.emit("onair://snapshot", &snap);
            if let Some(items) = app.try_state::<TrayItems>() {
                let _ = items.toggle.set_text(if snap.settings.requests.open { "Requests pausieren" } else { "Requests öffnen" });
            }
            if let Some(tray) = app.tray_by_id("main") {
                let tip = match &snap.spotify.playback {
                    onair_core::model::PlaybackView::Active(p) if snap.spotify.is_online() => p
                        .track
                        .as_ref()
                        .map(|t| format!("ON AIR – {} – {}", t.artist_line(), t.title))
                        .unwrap_or_else(|| "ON AIR".into()),
                    _ => "ON AIR".into(),
                };
                let tip: String = tip.chars().take(120).collect();
                let _ = tray.set_tooltip(Some(tip));
            }
        }
    });
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Zweiter Start: vorhandenes Fenster zeigen statt zweite Worker zu starten.
            show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(s) = app.try_state::<AppState>() {
                            let rt = s.rt.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = rt.transport("next").await;
                            });
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(dir) = logs_dir(&handle) {
                if let Some(guard) = init_logging(&dir) {
                    app.manage(guard);
                }
            }
            let data_dir = handle.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("onair.db")).map_err(Box::<dyn std::error::Error>::from)?;
            let rt = tauri::async_runtime::block_on(Runtime::start(RuntimeConfig {
                db,
                data_dir: Some(data_dir),
                secrets: Arc::new(keyring_store::KeyringStore),
                http: Arc::new(ReqwestTransport::new()),
                clock: Arc::new(SystemClock),
                endpoints: Endpoints::default(),
                start_overlay: true,
                app_version: env!("CARGO_PKG_VERSION").into(),
            }));
            tracing::info!(target: "app", version = env!("CARGO_PKG_VERSION"), "ON AIR gestartet");
            let hotkey = cfg::read(&rt.settings).hotkey_skip.clone();
            app.manage(AppState { rt: rt.clone() });
            let updates = updater::UpdateManager::new();
            app.manage(updates.clone());
            // Optionale Prüfung beim Start: blockiert nichts, installiert nie automatisch.
            if cfg::read(&rt.settings).updates.check_on_start && updater::pubkey().is_some() {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(20)).await;
                    let _ = updates.check(&h).await;
                });
            }
            build_tray(&handle)?;
            apply_hotkey(&handle, &hotkey);
            spawn_emitter(handle.clone(), rt.clone());
            let hidden = std::env::args().any(|a| a == "--hidden");
            if hidden {
                rt.set_ui_visible(false);
            } else {
                show_main(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            let app = window.app_handle();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if QUITTING.load(Ordering::SeqCst) {
                        return;
                    }
                    let behavior = app
                        .try_state::<AppState>()
                        .map(|s| cfg::read(&s.rt.settings).close_behavior)
                        .unwrap_or(CloseBehavior::Ask);
                    match behavior {
                        CloseBehavior::Quit => {
                            api.prevent_close();
                            quit(app);
                        }
                        CloseBehavior::Tray => {
                            api.prevent_close();
                            let _ = window.hide();
                            if let Some(s) = app.try_state::<AppState>() {
                                s.rt.set_ui_visible(false);
                            }
                        }
                        CloseBehavior::Ask => {
                            // UI zeigt eine Erklärung: Tray vs. vollständig beenden.
                            api.prevent_close();
                            let _ = app.emit_to("main", "onair://close-requested", ());
                        }
                    }
                }
                WindowEvent::Focused(true) => {
                    if let Some(s) = app.try_state::<AppState>() {
                        s.rt.set_ui_visible(true);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::spotify_login,
            commands::spotify_cancel_login,
            commands::spotify_logout,
            commands::twitch_login_start,
            commands::twitch_login_cancel,
            commands::twitch_logout,
            commands::transport,
            commands::list_devices,
            commands::transfer_playback,
            commands::search,
            commands::add_request,
            commands::queue_action,
            commands::set_requests_open,
            commands::update_settings,
            commands::export_settings,
            commands::import_settings,
            commands::profile_action,
            commands::blocklist_list,
            commands::blocklist_add,
            commands::blocklist_remove,
            commands::history,
            commands::run_diagnostics,
            commands::diagnostics_export,
            commands::write_export_file,
            commands::read_import_file,
            commands::open_external,
            commands::open_logs_folder,
            commands::get_control_token,
            commands::set_ui_visible,
            commands::open_compact,
            commands::close_action,
            commands::quit_app,
            commands::plan_set_end,
            commands::plan_extend,
            commands::plan_set_buffer,
            commands::plan_stop,
            commands::redemption_decide,
            commands::update_info,
            commands::update_check,
            commands::update_download,
            commands::update_preflight,
            commands::update_install,
            commands::update_later,
        ]);

    let app = builder.build(tauri::generate_context!()).expect("ON AIR konnte nicht starten");
    app.run(|app, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            // Letztes Fenster geschlossen, aber nicht „Beenden“ gewählt: im Tray weiterlaufen.
            if code.is_none() && !QUITTING.load(Ordering::SeqCst) {
                api.prevent_exit();
            }
        }
        let _ = app;
    });
}
