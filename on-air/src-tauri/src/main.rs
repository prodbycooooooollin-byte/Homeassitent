// Unter Windows im Release-Build kein Konsolenfenster öffnen.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    onair_desktop_lib::run()
}
