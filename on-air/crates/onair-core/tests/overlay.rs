//! Overlay-Server: Loopback, Host-Prüfung, getrennte Steuerung, keine Secrets.

use onair_core::overlay::{self, ControlAction, ControlHandler, DockAction, OverlayData};
use onair_core::settings::OverlaySettings;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Counter(Arc<AtomicUsize>);
impl ControlHandler for Counter {
    fn handle(&self, _a: ControlAction) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(()) })
    }
    fn dock_state(&self) -> futures_util::future::BoxFuture<'static, serde_json::Value> {
        Box::pin(async { serde_json::json!({ "queue": [], "requests": { "open": true } }) })
    }
    fn dock_action(&self, _a: DockAction) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        self.0.fetch_add(100, Ordering::SeqCst);
        Box::pin(async { Ok(()) })
    }
}

async fn raw(port: u16, req: String) -> String {
    let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    s.write_all(req.as_bytes()).await.unwrap();
    let mut buf = Vec::new();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(2), s.read_to_end(&mut buf)).await;
    String::from_utf8_lossy(&buf).to_string()
}

fn get(_port: u16, path: &str, host: &str) -> String {
    format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n")
}

fn post(port: u16, path: &str, extra: &str) -> String {
    format!("POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\nConnection: close\r\n{extra}\r\n")
}

#[tokio::test]
async fn overlay_security() {
    let mut styles = OverlaySettings::default();
    styles.control_enabled = true;
    let (tx, rx) = tokio::sync::watch::channel(OverlayData::empty(styles.clone()));
    let hits = Arc::new(AtomicUsize::new(0));
    let token = "0123456789abcdef0123456789abcdef01234567".to_string();
    let srv = overlay::start(0, rx, token.clone(), Arc::new(Counter(hits.clone()))).await.unwrap();
    let port = srv.port;

    // Lesender Zugriff ok, ohne Tokens.
    let r = raw(port, get(port, "/api/state?preset=glass", &format!("127.0.0.1:{port}"))).await;
    assert!(r.starts_with("HTTP/1.1 200"), "{r}");
    assert!(!r.contains(&token));
    assert!(!r.to_lowercase().contains("access_token"));
    assert!(!r.contains("access-control-allow-origin"));

    // DNS-Rebinding: fremder Host wird abgelehnt.
    let r = raw(port, get(port, "/api/state", "evil.example:80")).await;
    assert!(r.starts_with("HTTP/1.1 403"), "{r}");

    // Widget-Seite mit CSP.
    let r = raw(port, get(port, "/widget/queue", &format!("localhost:{port}"))).await;
    assert!(r.starts_with("HTTP/1.1 200") && r.contains("content-security-policy"), "{}", &r[..200.min(r.len())]);

    // Steuerung: ohne Token, mit falschem Token, mit Origin → abgelehnt.
    assert!(raw(port, post(port, "/api/control/skip", "")).await.starts_with("HTTP/1.1 401"));
    assert!(raw(port, post(port, "/api/control/skip", "X-OnAir-Token: wrong\r\n")).await.starts_with("HTTP/1.1 401"));
    let with_origin = format!("X-OnAir-Token: {token}\r\nOrigin: https://evil.example\r\n");
    assert!(raw(port, post(port, "/api/control/skip", &with_origin)).await.starts_with("HTTP/1.1 403"));
    assert_eq!(hits.load(Ordering::SeqCst), 0);
    let ok = format!("X-OnAir-Token: {token}\r\n");
    assert!(raw(port, post(port, "/api/control/skip", &ok)).await.starts_with("HTTP/1.1 200"));
    assert_eq!(hits.load(Ordering::SeqCst), 1);

    // Steuerung deaktiviert → abgelehnt, auch mit Token.
    styles.control_enabled = false;
    tx.send(OverlayData::empty(styles)).unwrap();
    assert!(raw(port, post(port, "/api/control/skip", &ok)).await.starts_with("HTTP/1.1 403"));
    assert_eq!(hits.load(Ordering::SeqCst), 1);
}

// OBS-Dock: Seite öffentlich (ohne Geheimnis), Daten und Aktionen nur mit Schlüssel und
// nur von eigener Herkunft; Schlüssel steht nie in der ausgelieferten Seite.
#[tokio::test]
async fn dock_requires_key_and_own_origin() {
    let styles = OverlaySettings::default(); // Steuerung aus – Dock ist davon unabhängig
    let (_tx, rx) = tokio::sync::watch::channel(OverlayData::empty(styles));
    let hits = Arc::new(AtomicUsize::new(0));
    let token = "fedcba9876543210fedcba9876543210fedcba98".to_string();
    let srv = overlay::start(0, rx, token.clone(), Arc::new(Counter(hits.clone()))).await.unwrap();
    let port = srv.port;
    let host = format!("127.0.0.1:{port}");

    let page = raw(port, get(port, "/dock", &host)).await;
    assert!(page.starts_with("HTTP/1.1 200") && page.contains("content-security-policy"));
    assert!(!page.contains(&token), "Schlüssel nie in der Seite");

    let state = |extra: &str| format!("GET /api/dock/state HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n{extra}\r\n");
    assert!(raw(port, state("")).await.starts_with("HTTP/1.1 401"));
    assert!(raw(port, state("X-OnAir-Dock: wrong\r\n")).await.starts_with("HTTP/1.1 401"));
    let r = raw(port, state(&format!("X-OnAir-Dock: {token}\r\n"))).await;
    assert!(r.starts_with("HTTP/1.1 200") && r.contains("\"queue\""), "{r}");
    assert!(!r.contains("access-control-allow-origin"));
    // DNS-Rebinding bleibt gesperrt, auch mit Schlüssel.
    let rebind = format!("GET /api/dock/state HTTP/1.1\r\nHost: evil.example\r\nX-OnAir-Dock: {token}\r\nConnection: close\r\n\r\n");
    assert!(raw(port, rebind).await.starts_with("HTTP/1.1 403"));

    // Aktionen: fremde Herkunft abgelehnt, eigene Herkunft mit Schlüssel erlaubt.
    let evil = format!("X-OnAir-Dock: {token}\r\nOrigin: https://evil.example\r\n");
    assert!(raw(port, post(port, "/api/dock/skip", &evil)).await.starts_with("HTTP/1.1 403"));
    assert!(raw(port, post(port, "/api/dock/skip", "")).await.starts_with("HTTP/1.1 401"));
    assert_eq!(hits.load(Ordering::SeqCst), 0);
    let own = format!("X-OnAir-Dock: {token}\r\nOrigin: http://127.0.0.1:{port}\r\n");
    assert!(raw(port, post(port, "/api/dock/skip", &own)).await.starts_with("HTTP/1.1 200"));
    assert_eq!(hits.load(Ordering::SeqCst), 100);
    assert!(raw(port, post(port, "/api/dock/unknown", &own)).await.starts_with("HTTP/1.1 404"));
}
