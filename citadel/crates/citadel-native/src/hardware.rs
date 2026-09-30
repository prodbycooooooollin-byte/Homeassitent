//! Hardware-Snapshot. Unter Windows über CIM (PowerShell Get-CimInstance), Registry (VRAM) und
//! EnumDisplaySettings (Display-Modi). Was nicht ermittelbar ist, bleibt `null` mit Quelle/Hinweis.
//! Nur auf Anforderung – keine Dauerabfragen.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize, Clone)]
pub struct Probe<T: Serialize> {
    pub value: Option<T>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl<T: Serialize> Probe<T> {
    fn some(v: T, source: &str) -> Self {
        Probe { value: Some(v), source: source.into(), note: None }
    }
    fn none(source: &str, note: &str) -> Self {
        Probe { value: None, source: source.into(), note: Some(note.into()) }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct Cpu {
    pub name: String,
    pub cores: Option<u32>,
    pub threads: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub vendor: String,
    pub vram_mb: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_note: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pnp_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Mode {
    pub w: u32,
    pub h: u32,
    pub hz: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub name: String,
    pub primary: bool,
    pub current_width: Option<u32>,
    pub current_height: Option<u32>,
    pub current_hz: Option<u32>,
    pub max_hz_at_current_res: Option<u32>,
    pub modes: Vec<Mode>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Os {
    pub name: String,
    pub version: String,
    pub build: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub schema: u32,
    pub captured_at: String,
    pub method: String,
    pub cpu: Probe<Cpu>,
    pub gpus: Probe<Vec<Gpu>>,
    pub active_gpu_index: Option<usize>,
    pub ram_total_mb: Probe<u64>,
    pub ram_used_mb: Probe<u64>,
    pub os: Probe<Os>,
    pub displays: Probe<Vec<Display>>,
    pub laptop: Probe<bool>,
    pub power_plan: Probe<String>,
}

pub fn vendor_of(name: &str, compat: &str) -> &'static str {
    let s = format!("{name} {compat}").to_lowercase();
    if s.contains("nvidia") || s.contains("geforce") || s.contains("quadro") || s.contains("rtx") {
        "nvidia"
    } else if s.contains("amd") || s.contains("radeon") || s.contains("advanced micro devices") {
        "amd"
    } else if s.contains("intel") || s.contains("arc") || s.contains("iris") || s.contains("uhd graphics") {
        "intel"
    } else {
        "other"
    }
}

/// Wandelt ein CIM-Datum (20240115000000.000000-000) in JJJJ-MM-TT.
pub fn cim_date(s: &str) -> Option<String> {
    if s.len() >= 8 && s[..8].chars().all(|c| c.is_ascii_digit()) {
        return Some(format!("{}-{}-{}", &s[..4], &s[4..6], &s[6..8]));
    }
    // PowerShell kann DateTime auch als "/Date(1705276800000)/" serialisieren
    let ms: i64 = s.trim_start_matches("/Date(").split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()?;
    chrono::DateTime::from_timestamp(ms / 1000, 0).map(|d| d.format("%Y-%m-%d").to_string())
}

/// Wertet die JSON-Ausgabe des CIM-Skripts aus (separat testbar).
pub fn parse_cim(v: &Value) -> (Probe<Cpu>, Vec<Gpu>, Probe<Os>, Option<u64>, Option<u64>, Probe<bool>) {
    let cpu = v.get("cpu").filter(|c| !c.is_null()).map(|c| Cpu {
        name: c.get("Name").and_then(Value::as_str).unwrap_or("").trim().to_string(),
        cores: c.get("NumberOfCores").and_then(Value::as_u64).map(|n| n as u32),
        threads: c.get("NumberOfLogicalProcessors").and_then(Value::as_u64).map(|n| n as u32),
    });
    let gpus_v: Vec<Value> = match v.get("gpu") {
        Some(Value::Array(a)) => a.clone(),
        Some(Value::Object(_)) => vec![v["gpu"].clone()],
        _ => vec![],
    };
    let gpus = gpus_v
        .iter()
        .map(|g| {
            let name = g.get("Name").and_then(Value::as_str).unwrap_or("Unbekannt").to_string();
            let compat = g.get("AdapterCompatibility").and_then(Value::as_str).unwrap_or("");
            let ram = g.get("AdapterRAM").and_then(Value::as_u64);
            Gpu {
                vendor: vendor_of(&name, compat).into(),
                vram_mb: ram.map(|r| r / (1024 * 1024)),
                vram_note: ram.filter(|r| *r >= 4_293_918_720).map(|_| "Win32_VideoController.AdapterRAM ist auf 4 GB begrenzt – tatsächlicher VRAM kann höher sein".into()),
                driver_version: g.get("DriverVersion").and_then(Value::as_str).map(String::from),
                driver_date: g.get("DriverDate").and_then(Value::as_str).and_then(cim_date),
                pnp_id: g.get("PNPDeviceID").and_then(Value::as_str).map(String::from),
                name,
            }
        })
        .collect();
    let os = v.get("os").filter(|o| !o.is_null()).map(|o| Os {
        name: o.get("Caption").and_then(Value::as_str).unwrap_or("Windows").trim().to_string(),
        version: o.get("Version").and_then(Value::as_str).unwrap_or("").to_string(),
        build: o.get("BuildNumber").and_then(Value::as_str).map(String::from),
    });
    let total_kb = v.get("os").and_then(|o| o.get("TotalVisibleMemorySize")).and_then(Value::as_u64);
    let free_kb = v.get("os").and_then(|o| o.get("FreePhysicalMemory")).and_then(Value::as_u64);
    let laptop = match (v.get("cs").and_then(|c| c.get("PCSystemType")).and_then(Value::as_u64), v.get("battery").and_then(Value::as_u64)) {
        (Some(2), _) => Probe::some(true, "Win32_ComputerSystem.PCSystemType"),
        (_, Some(n)) if n > 0 => Probe::some(true, "Win32_Battery"),
        (Some(_), Some(0)) => Probe::some(false, "Win32_ComputerSystem/Win32_Battery"),
        _ => Probe::none("Win32_ComputerSystem", "Nicht ermittelbar"),
    };
    (
        cpu.map(|c| Probe::some(c, "Win32_Processor")).unwrap_or_else(|| Probe::none("Win32_Processor", "Nicht ermittelbar")),
        gpus,
        os.map(|o| Probe::some(o, "Win32_OperatingSystem")).unwrap_or_else(|| Probe::none("Win32_OperatingSystem", "Nicht ermittelbar")),
        total_kb.map(|k| k / 1024),
        match (total_kb, free_kb) {
            (Some(t), Some(f)) => Some((t - f) / 1024),
            _ => None,
        },
        laptop,
    )
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const SCRIPT: &str = "$ErrorActionPreference='SilentlyContinue';\
$cpu=Get-CimInstance Win32_Processor|Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors;\
$gpu=@(Get-CimInstance Win32_VideoController|Select-Object Name,AdapterRAM,DriverVersion,@{n='DriverDate';e={$_.DriverDate.ToString('yyyyMMdd')}},PNPDeviceID,AdapterCompatibility);\
$os=Get-CimInstance Win32_OperatingSystem|Select-Object Caption,Version,BuildNumber,TotalVisibleMemorySize,FreePhysicalMemory;\
$cs=Get-CimInstance Win32_ComputerSystem|Select-Object PCSystemType;\
$bat=@(Get-CimInstance Win32_Battery).Count;\
[pscustomobject]@{cpu=$cpu;gpu=$gpu;os=$os;cs=$cs;battery=$bat}|ConvertTo-Json -Depth 4 -Compress";

    pub fn cim() -> Result<Value, String> {
        let out = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("PowerShell nicht startbar: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        serde_json::from_slice(&out.stdout).map_err(|e| format!("CIM-Ausgabe nicht lesbar: {e}"))
    }

    /// Tatsächlicher VRAM aus der Registry (HardwareInformation.qwMemorySize), falls vorhanden.
    pub fn registry_vram() -> Vec<(String, u64)> {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let mut out = Vec::new();
        let Ok(class) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}") else { return out };
        for name in class.enum_keys().flatten() {
            if let Ok(k) = class.open_subkey(&name) {
                let desc: Result<String, _> = k.get_value("DriverDesc");
                let mem: Result<u64, _> = k.get_value("HardwareInformation.qwMemorySize");
                if let (Ok(d), Ok(m)) = (desc, mem) {
                    out.push((d, m));
                }
            }
        }
        out
    }

    pub fn power_plan() -> Option<String> {
        let out = Command::new("powercfg").arg("/getactivescheme").creation_flags(CREATE_NO_WINDOW).output().ok()?;
        let s = String::from_utf8_lossy(&out.stdout).to_string();
        let start = s.find('(')?;
        let end = s.rfind(')')?;
        Some(s[start + 1..end].to_string())
    }

    pub fn displays() -> Vec<Display> {
        use windows_sys::Win32::Graphics::Gdi::{EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICEW, DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, DISPLAY_DEVICE_PRIMARY_DEVICE, ENUM_CURRENT_SETTINGS};
        let mut out = Vec::new();
        let mut i = 0u32;
        loop {
            let mut dd: DISPLAY_DEVICEW = unsafe { std::mem::zeroed() };
            dd.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
            if unsafe { EnumDisplayDevicesW(std::ptr::null(), i, &mut dd, 0) } == 0 {
                break;
            }
            i += 1;
            if dd.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP == 0 {
                continue;
            }
            let dev_name = dd.DeviceName;
            let mut cur: DEVMODEW = unsafe { std::mem::zeroed() };
            cur.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
            let has_cur = unsafe { EnumDisplaySettingsW(dev_name.as_ptr(), ENUM_CURRENT_SETTINGS, &mut cur) } != 0;
            let mut modes: Vec<Mode> = Vec::new();
            let mut m = 0u32;
            loop {
                let mut dm: DEVMODEW = unsafe { std::mem::zeroed() };
                dm.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
                if unsafe { EnumDisplaySettingsW(dev_name.as_ptr(), m, &mut dm) } == 0 {
                    break;
                }
                m += 1;
                let mode = Mode { w: dm.dmPelsWidth, h: dm.dmPelsHeight, hz: dm.dmDisplayFrequency };
                if !modes.iter().any(|x| x.w == mode.w && x.h == mode.h && x.hz == mode.hz) {
                    modes.push(mode);
                }
            }
            let (cw, ch, chz) = if has_cur { (Some(cur.dmPelsWidth), Some(cur.dmPelsHeight), Some(cur.dmDisplayFrequency)) } else { (None, None, None) };
            let max_hz = match (cw, ch) {
                (Some(w), Some(h)) => modes.iter().filter(|x| x.w == w && x.h == h).map(|x| x.hz).max(),
                _ => None,
            };
            let name = String::from_utf16_lossy(&dd.DeviceString).trim_end_matches('\0').to_string();
            let dev = String::from_utf16_lossy(&dev_name).trim_end_matches('\0').to_string();
            out.push(Display {
                name: format!("{dev} ({name})"),
                primary: dd.StateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE != 0,
                current_width: cw,
                current_height: ch,
                current_hz: chz,
                max_hz_at_current_res: max_hz,
                modes,
            });
        }
        out
    }
}

pub fn snapshot() -> Snapshot {
    let captured_at = crate::now_iso();
    #[cfg(windows)]
    {
        let (cpu, mut gpus, os, total, used, laptop, cim_err) = match win::cim() {
            Ok(v) => {
                let (a, b, c, d, e, f) = parse_cim(&v);
                (a, b, c, d, e, f, None)
            }
            Err(e) => (Probe::none("Win32_Processor", &e), vec![], Probe::none("Win32_OperatingSystem", &e), None, None, Probe::none("Win32_ComputerSystem", &e), Some(e)),
        };
        for (desc, mem) in win::registry_vram() {
            if let Some(g) = gpus.iter_mut().find(|g| g.name.eq_ignore_ascii_case(&desc)) {
                g.vram_mb = Some(mem / (1024 * 1024));
                g.vram_note = None;
            }
        }
        let active = if gpus.len() == 1 { Some(0) } else { None };
        let displays = win::displays();
        return Snapshot {
            schema: 1,
            captured_at,
            method: "windows-native".into(),
            cpu,
            gpus: if gpus.is_empty() { Probe::none("Win32_VideoController", cim_err.as_deref().unwrap_or("Keine Grafikadapter gemeldet")) } else { Probe::some(gpus, "Win32_VideoController + Registry (qwMemorySize)") },
            active_gpu_index: active,
            ram_total_mb: total.map(|t| Probe::some(t, "Win32_OperatingSystem")).unwrap_or_else(|| Probe::none("Win32_OperatingSystem", "Nicht ermittelbar")),
            ram_used_mb: used.map(|t| Probe::some(t, "Win32_OperatingSystem (Momentaufnahme)")).unwrap_or_else(|| Probe::none("Win32_OperatingSystem", "Nicht ermittelbar")),
            os,
            displays: if displays.is_empty() { Probe::none("EnumDisplaySettings", "Nicht ermittelbar") } else { Probe::some(displays, "EnumDisplayDevices/EnumDisplaySettings") },
            laptop,
            power_plan: win::power_plan().map(|p| Probe::some(p, "powercfg /getactivescheme")).unwrap_or_else(|| Probe::none("powercfg", "Nicht ermittelbar")),
        };
    }
    #[cfg(not(windows))]
    {
        use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
        let sys = System::new_with_specifics(RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing()).with_memory(MemoryRefreshKind::everything()));
        let cpu_name = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
        let na = "Nur unter Windows ermittelt";
        Snapshot {
            schema: 1,
            captured_at,
            method: "windows-native".into(),
            cpu: if cpu_name.is_empty() { Probe::none("sysinfo", "Nicht ermittelbar") } else { Probe::some(Cpu { name: cpu_name, cores: sys.physical_core_count().map(|c| c as u32), threads: Some(sys.cpus().len() as u32) }, "sysinfo") },
            gpus: Probe::none("—", na),
            active_gpu_index: None,
            ram_total_mb: Probe::some(sys.total_memory() / 1024 / 1024, "sysinfo"),
            ram_used_mb: Probe::some(sys.used_memory() / 1024 / 1024, "sysinfo"),
            os: Probe::some(Os { name: System::name().unwrap_or_default(), version: System::os_version().unwrap_or_default(), build: System::kernel_version() }, "sysinfo"),
            displays: Probe::none("—", na),
            laptop: Probe::none("—", na),
            power_plan: Probe::none("—", na),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_cim_json() {
        let v: Value = serde_json::from_str(
            r#"{"cpu":{"Name":"AMD Ryzen 7 5800X3D 8-Core Processor ","NumberOfCores":8,"NumberOfLogicalProcessors":16},
            "gpu":{"Name":"NVIDIA GeForce RTX 3070","AdapterRAM":4293918720,"DriverVersion":"32.0.15.6094","DriverDate":"20240915","AdapterCompatibility":"NVIDIA"},
            "os":{"Caption":"Microsoft Windows 11 Pro","Version":"10.0.26100","BuildNumber":"26100","TotalVisibleMemorySize":33462272,"FreePhysicalMemory":16731136},
            "cs":{"PCSystemType":1},"battery":0}"#,
        )
        .unwrap();
        let (cpu, gpus, os, total, used, laptop) = parse_cim(&v);
        assert_eq!(cpu.value.unwrap().threads, Some(16));
        assert_eq!(gpus[0].vendor, "nvidia");
        assert!(gpus[0].vram_note.is_some());
        assert_eq!(gpus[0].driver_date.as_deref(), Some("2024-09-15"));
        assert_eq!(os.value.unwrap().build.as_deref(), Some("26100"));
        assert_eq!(total, Some(32678));
        assert_eq!(used, Some(16339));
        assert_eq!(laptop.value, Some(false));
    }
}
