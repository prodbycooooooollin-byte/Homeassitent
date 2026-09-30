//! Prüft, ob Deadlock läuft (nur bei Bedarf, keine Dauerüberwachung).

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

pub const PROCESS_NAMES: &[&str] = &["deadlock.exe", "deadlock"];

pub fn is_game_running() -> bool {
    let mut sys = System::new_with_specifics(RefreshKind::nothing());
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        PROCESS_NAMES.contains(&n.as_str())
    })
}
