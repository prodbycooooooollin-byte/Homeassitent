//! Prüft die Command-Schnittstelle mit denselben JSON-Payloads, die die Oberfläche sendet
//! (src/platform/tauri.ts) – über Tauris Mock-Runtime.
use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;

fn call(w: &tauri::WebviewWindow<tauri::test::MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
    get_ipc_response(
        w,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: (if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" }).parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

#[test]
fn frontend_payloads_match_commands() {
    let home = tempfile::tempdir().unwrap();
    std::env::set_var("HOME", home.path());
    std::env::set_var("XDG_DATA_HOME", home.path().join("data"));
    let install = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(install.path().join("game/citadel/cfg")).unwrap();
    std::fs::write(install.path().join("game/citadel/cfg/video.txt"), "\"video.cfg\"\n{\n\t\"setting.fps_max\"\t\t\"0\"\n}\n").unwrap();

    let app = citadel_lib::with_commands_for_tests(mock_builder())
        .build(tauri::generate_context!())
        .unwrap();
    let w = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();

    // Nicht registrierte Installation → abgelehnt
    let e = call(&w, "read_config", json!({ "root": install.path(), "relPath": "game/citadel/cfg/video.txt" })).unwrap_err();
    assert_eq!(e["code"], "path");

    let inst = call(&w, "register_installation", json!({ "path": install.path().join("game/citadel/cfg") })).unwrap();
    let root = inst["root"].as_str().unwrap().to_string();
    assert!(inst["files"].as_array().unwrap().iter().any(|f| f["kind"] == "video.txt" && f["exists"] == true));

    let r = call(&w, "read_config", json!({ "root": root, "relPath": "game/citadel/cfg/video.txt" })).unwrap();
    assert_eq!(r["encodingOk"], true);
    let sha = r["sha256"].as_str().unwrap().to_string();

    let out = call(
        &w,
        "apply_changes",
        json!({ "req": {
            "installRoot": root, "installationId": inst["id"], "buildId": null, "changeSetId": "cs", "reason": "Test",
            "changeSummary": ["fps_max 0 → 144"],
            "files": [{ "relPath": "game/citadel/cfg/video.txt", "text": r["text"].as_str().unwrap().replace("\"0\"", "\"144\""), "bom": false, "expectedSha256": sha }]
        }}),
    )
    .unwrap();
    let backup_id = out["backupId"].as_str().unwrap().to_string();
    assert_eq!(out["files"][0]["readbackOk"], true);

    // Konflikt: alte Prüfsumme erneut verwenden
    let e = call(
        &w,
        "apply_changes",
        json!({ "req": { "installRoot": root, "installationId": inst["id"], "buildId": null, "changeSetId": "cs2", "reason": "Test", "changeSummary": [],
            "files": [{ "relPath": "game/citadel/cfg/video.txt", "text": "x", "bom": false, "expectedSha256": sha }] }}),
    )
    .unwrap_err();
    assert_eq!(e["code"], "conflict");

    let list = call(&w, "list_backups", json!({})).unwrap();
    assert!(list.as_array().unwrap().iter().any(|b| b["id"] == backup_id.as_str()));
    assert!(call(&w, "backup_text", json!({ "id": backup_id, "kind": "video.txt" })).unwrap().as_str().unwrap().contains("\"0\""));
    let snap = call(&w, "snapshot_backup", json!({ "req": { "installRoot": root, "installationId": inst["id"], "buildId": null, "reason": "ok", "relPaths": ["game/citadel/cfg/video.txt"], "working": "user" } })).unwrap();
    assert!(snap["working"].is_object());
    call(&w, "mark_backup_working", json!({ "id": backup_id, "how": "user" })).unwrap();
    let rs = call(&w, "restore_backup", json!({ "id": backup_id, "currentBuild": null, "kinds": null })).unwrap();
    assert!(rs["preRestoreBackupId"].is_string());
    assert!(std::fs::read_to_string(install.path().join("game/citadel/cfg/video.txt")).unwrap().contains("\"0\""));

    call(&w, "store_put", json!({ "coll": "profiles", "id": "p1", "json": "{\"a\":1}" })).unwrap();
    assert_eq!(call(&w, "store_get", json!({ "coll": "profiles", "id": "p1" })).unwrap(), json!("{\"a\":1}"));
    assert_eq!(call(&w, "store_list", json!({ "coll": "profiles" })).unwrap().as_array().unwrap().len(), 1);
    call(&w, "store_delete", json!({ "coll": "profiles", "id": "p1" })).unwrap();
    assert!(call(&w, "game_running", json!({})).unwrap().is_boolean());
}
