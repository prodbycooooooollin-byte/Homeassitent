//! Lokaler Overlay-Server für OBS Browser Sources.
//!
//! - Bindet ausschließlich an 127.0.0.1.
//! - Lesende Endpunkte liefern nur Anzeige-Metadaten – niemals Tokens.
//! - Schreibende Steuerung ist getrennt, standardmäßig deaktiviert und verlangt ein
//!   zufälliges Steuer-Token im Header `X-OnAir-Token` (kein Query-Parameter, damit es
//!   nicht in OBS-URLs oder Logs landet).
//! - `Host`-Prüfung gegen DNS-Rebinding; keine CORS-Header, damit fremde Webseiten
//!   Antworten nicht lesen können.

mod widget;

use crate::settings::{OverlaySettings, WidgetStyle};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, watch};
use tokio_stream::wrappers::WatchStream;
use tokio_stream::StreamExt;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct NowPlaying {
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub image_url: Option<String>,
    pub duration_ms: u64,
    pub progress_ms: u64,
    pub is_playing: bool,
    pub fetched_at_ms: i64,
    pub requester: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct QueueItem {
    pub title: String,
    pub artists: Vec<String>,
    pub requester: String,
    pub image_url: Option<String>,
}

/// Was ein Widget sehen darf. Keine Kontodaten, keine Fehlermeldungen.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OverlayData {
    /// `live` | `idle` (nichts läuft) | `unavailable` (keine gesicherten Daten)
    pub status: &'static str,
    pub now: Option<NowPlaying>,
    pub queue: Vec<QueueItem>,
    pub stale_after_ms: u64,
    pub styles: OverlaySettings,
}

impl OverlayData {
    pub fn empty(styles: OverlaySettings) -> Self {
        Self { status: "unavailable", now: None, queue: vec![], stale_after_ms: styles.stale_after_s as u64 * 1000, styles }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ControlAction {
    Skip,
    OpenRequests,
    CloseRequests,
}

pub trait ControlHandler: Send + Sync + 'static {
    fn handle(&self, action: ControlAction) -> futures_util::future::BoxFuture<'static, Result<(), String>>;
}

#[derive(Clone)]
struct AppState {
    data: watch::Receiver<OverlayData>,
    port: u16,
    control_token: Arc<String>,
    control: Arc<dyn ControlHandler>,
    clients: Arc<std::sync::atomic::AtomicUsize>,
}

pub struct OverlayServer {
    pub port: u16,
    shutdown: Option<oneshot::Sender<()>>,
    pub clients: Arc<std::sync::atomic::AtomicUsize>,
}

impl OverlayServer {
    pub fn connected_clients(&self) -> usize {
        self.clients.load(std::sync::atomic::Ordering::Relaxed)
    }
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for OverlayServer {
    fn drop(&mut self) {
        self.stop();
    }
}

pub async fn start(
    port: u16,
    data: watch::Receiver<OverlayData>,
    control_token: String,
    control: Arc<dyn ControlHandler>,
) -> Result<OverlayServer, String> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Port {port} nicht verfügbar: {e}"))?;
    let actual = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    let clients = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let state = AppState { data, port: actual, control_token: Arc::new(control_token), control, clients: clients.clone() };
    let app = Router::new()
        .route("/", get(index))
        .route("/widget/{preset}", get(widget_page))
        .route("/api/state", get(api_state))
        .route("/api/events", get(api_events))
        .route("/api/control/{action}", post(api_control))
        .layer(axum::middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state);
    let (tx, rx) = oneshot::channel::<()>();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });
    Ok(OverlayServer { port: actual, shutdown: Some(tx), clients })
}

/// DNS-Rebinding-Schutz und Sicherheits-Header für alle Antworten.
async fn guard(
    State(st): State<AppState>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let host = req.headers().get("host").and_then(|h| h.to_str().ok()).unwrap_or("");
    let ok_hosts = [format!("127.0.0.1:{}", st.port), format!("localhost:{}", st.port)];
    if !ok_hosts.iter().any(|h| h == host) {
        return (StatusCode::FORBIDDEN, "forbidden").into_response();
    }
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    h.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    h.insert("Referrer-Policy", HeaderValue::from_static("no-referrer"));
    h.insert("Cache-Control", HeaderValue::from_static("no-store"));
    resp
}

async fn index() -> Html<&'static str> {
    Html(widget::INDEX_HTML)
}

#[derive(Deserialize)]
struct PresetQuery {
    #[serde(default)]
    preview: Option<String>,
}

async fn widget_page(Path(preset): Path<String>, Query(q): Query<PresetQuery>) -> Response {
    if !matches!(preset.as_str(), "minimal" | "glass" | "queue") {
        return (StatusCode::NOT_FOUND, "Unbekanntes Widget").into_response();
    }
    let preview = q.preview.as_deref() == Some("1");
    let html = widget::WIDGET_HTML
        .replace("__PRESET__", &preset)
        .replace("__PREVIEW__", if preview { "true" } else { "false" });
    let mut resp = Html(html).into_response();
    resp.headers_mut().insert(
        "Content-Security-Policy",
        HeaderValue::from_static("default-src 'none'; img-src https://i.scdn.co https://*.spotifycdn.com data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; font-src data:"),
    );
    resp
}

#[derive(Serialize)]
struct WidgetPayload {
    status: &'static str,
    now: Option<NowPlaying>,
    queue: Vec<QueueItem>,
    stale_after_ms: u64,
    server_time_ms: i64,
    style: Option<WidgetStyle>,
}

fn payload(d: &OverlayData, preset: &str) -> WidgetPayload {
    let style = match preset {
        "minimal" => Some(d.styles.minimal.clone()),
        "glass" => Some(d.styles.glass.clone()),
        "queue" => Some(d.styles.queue.clone()),
        _ => None,
    };
    let n = style.as_ref().map(|s| s.queue_count as usize).unwrap_or(3);
    WidgetPayload {
        status: d.status,
        now: d.now.clone(),
        queue: d.queue.iter().take(n).cloned().collect(),
        stale_after_ms: d.stale_after_ms,
        server_time_ms: crate::clock::Clock::now_ms(&crate::clock::SystemClock),
        style,
    }
}

#[derive(Deserialize)]
struct StateQuery {
    #[serde(default)]
    preset: String,
}

async fn api_state(State(st): State<AppState>, Query(q): Query<StateQuery>) -> Json<WidgetPayload> {
    Json(payload(&st.data.borrow(), &q.preset))
}

struct ClientGuard(Arc<std::sync::atomic::AtomicUsize>);
impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }
}

async fn api_events(
    State(st): State<AppState>,
    Query(q): Query<StateQuery>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    st.clients.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let guard = Arc::new(ClientGuard(st.clients.clone()));
    let preset = q.preset.clone();
    let changes = WatchStream::new(st.data.clone());
    // Regelmäßiger Herzschlag mit aktuellem Stand: Widgets erkennen einen
    // abgebrochenen Server und veraltete Daten auch ohne Änderungen.
    let data = st.data.clone();
    let ticks = tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(Duration::from_secs(5)))
        .map(move |_| data.borrow().clone());
    let stream = changes.merge(ticks).map(move |d| {
        let _keep = &guard;
        let json = serde_json::to_string(&payload(&d, &preset)).unwrap_or_else(|_| "{}".into());
        Ok(Event::default().event("state").data(json))
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn api_control(State(st): State<AppState>, Path(action): Path<String>, headers: HeaderMap) -> Response {
    let enabled = st.data.borrow().styles.control_enabled;
    if !enabled {
        return (StatusCode::FORBIDDEN, "Steuerung deaktiviert").into_response();
    }
    // Browser-Anfragen fremder Seiten tragen einen Origin-Header – ablehnen.
    if headers.get("origin").is_some() {
        return (StatusCode::FORBIDDEN, "forbidden").into_response();
    }
    let token = headers.get("x-onair-token").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !constant_time_eq(token.as_bytes(), st.control_token.as_bytes()) || st.control_token.is_empty() {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let action = match action.as_str() {
        "skip" => ControlAction::Skip,
        "open_requests" => ControlAction::OpenRequests,
        "close_requests" => ControlAction::CloseRequests,
        _ => return (StatusCode::NOT_FOUND, "unknown").into_response(),
    };
    match st.control.handle(action).await {
        Ok(()) => (StatusCode::OK, "ok").into_response(),
        Err(e) => (StatusCode::CONFLICT, e).into_response(),
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
