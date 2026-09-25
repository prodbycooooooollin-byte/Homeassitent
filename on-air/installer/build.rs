// Bettet das NSIS-Paket der App ein. Der Release-Workflow setzt ONAIR_SETUP_PAYLOAD auf die
// frisch gebaute `*-setup.exe`. Ohne Variable entsteht ein leerer Platzhalter – der Installer
// startet dann, meldet aber ehrlich „Paket fehlt“ (nur für Entwicklung/Vorschau).
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=ONAIR_SETUP_PAYLOAD");
    println!("cargo:rerun-if-env-changed=ONAIR_SETUP_VERSION");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("payload.bin");
    match env::var("ONAIR_SETUP_PAYLOAD").ok().filter(|p| !p.is_empty()) {
        Some(p) => {
            println!("cargo:rerun-if-changed={p}");
            fs::copy(&p, &out).unwrap_or_else(|e| panic!("ONAIR_SETUP_PAYLOAD {p}: {e}"));
        }
        None => fs::write(&out, b"").unwrap(),
    }
    tauri_build::build();
}
