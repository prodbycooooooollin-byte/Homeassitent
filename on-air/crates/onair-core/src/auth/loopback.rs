//! Einmaliger Loopback-Empfänger für den OAuth-Redirect (Systembrowser → 127.0.0.1).
//! Prüft Pfad und `state`; die vollständige Callback-URL wird nie geloggt.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LoginError {
    #[error("Port {port} ist belegt – ein anderes Programm nutzt ihn")]
    PortInUse { port: u16 },
    #[error("Zeitüberschreitung – Anmeldung im Browser nicht abgeschlossen")]
    Timeout,
    #[error("Anmeldung abgebrochen")]
    Cancelled,
    #[error("Zugriff im Browser verweigert ({error})")]
    Denied { error: String },
    #[error("Ungültige Antwort (state stimmt nicht)")]
    StateMismatch,
    #[error("Token-Austausch fehlgeschlagen: {message}")]
    Exchange { message: String },
    #[error("{message}")]
    Other { message: String },
}

pub struct LoopbackListener {
    listener: TcpListener,
    path: String,
}

impl LoopbackListener {
    /// Bindet vor dem Öffnen des Browsers, damit ein belegter Port sofort auffällt.
    pub async fn bind(addr: SocketAddr, path: &str) -> Result<Self, LoginError> {
        let listener = TcpListener::bind(addr).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                LoginError::PortInUse { port: addr.port() }
            } else {
                LoginError::Other { message: e.to_string() }
            }
        })?;
        Ok(Self { listener, path: path.to_string() })
    }

    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.listener.local_addr().ok()
    }

    /// Wartet auf den Redirect und liefert den Autorisierungscode.
    pub async fn wait_for_code(
        self,
        expected_state: &str,
        timeout: Duration,
        cancel: oneshot::Receiver<()>,
    ) -> Result<String, LoginError> {
        let fut = async {
            loop {
                let (mut sock, _) = self
                    .listener
                    .accept()
                    .await
                    .map_err(|e| LoginError::Other { message: e.to_string() })?;
                let mut buf = vec![0u8; 8192];
                let n = match tokio::time::timeout(Duration::from_secs(5), sock.read(&mut buf)).await {
                    Ok(Ok(n)) => n,
                    _ => continue,
                };
                let head = String::from_utf8_lossy(&buf[..n]);
                let target = head
                    .lines()
                    .next()
                    .and_then(|l| l.split_whitespace().nth(1))
                    .unwrap_or("")
                    .to_string();
                let (path, query) = target.split_once('?').unwrap_or((target.as_str(), ""));
                if path != self.path {
                    let _ = respond(&mut sock, 404, "Nicht gefunden").await;
                    continue;
                }
                let params: HashMap<String, String> = url::form_urlencoded::parse(query.as_bytes())
                    .into_owned()
                    .collect();
                let result = if params.get("state").map(String::as_str) != Some(expected_state) {
                    Err(LoginError::StateMismatch)
                } else if let Some(err) = params.get("error") {
                    Err(LoginError::Denied { error: err.clone() })
                } else if let Some(code) = params.get("code") {
                    Ok(code.clone())
                } else {
                    Err(LoginError::Other { message: "Antwort ohne Code".into() })
                };
                let page = match &result {
                    Ok(_) => "Anmeldung abgeschlossen. Du kannst dieses Fenster schließen und zu ON AIR zurückkehren.",
                    Err(LoginError::StateMismatch) => "Diese Anmeldung passt nicht zur laufenden Anfrage. Bitte starte die Anmeldung in ON AIR erneut.",
                    Err(_) => "Anmeldung nicht abgeschlossen. Details findest du in ON AIR.",
                };
                let _ = respond(&mut sock, 200, page).await;
                // Ein falscher state beendet den Vorgang nicht: ein veralteter Tab darf
                // die laufende Anmeldung nicht kapern, aber auch nicht abbrechen.
                if matches!(result, Err(LoginError::StateMismatch)) {
                    continue;
                }
                return result;
            }
        };
        tokio::select! {
            r = fut => r,
            _ = tokio::time::sleep(timeout) => Err(LoginError::Timeout),
            _ = cancel => Err(LoginError::Cancelled),
        }
    }
}

async fn respond(sock: &mut tokio::net::TcpStream, status: u16, text: &str) -> std::io::Result<()> {
    let body = format!(
        "<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"><title>ON AIR</title>\
<body style=\"background:#101114;color:#ECEDEE;font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0\">\
<p style=\"max-width:32rem;text-align:center;line-height:1.5\">{}</p></body></html>",
        text
    );
    let reason = if status == 200 { "OK" } else { "Not Found" };
    let resp = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    sock.write_all(resp.as_bytes()).await?;
    sock.shutdown().await
}
