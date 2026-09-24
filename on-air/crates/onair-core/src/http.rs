//! Transport-Abstraktion. Die API-Clients bauen Anfragen und interpretieren
//! Antworten; das eigentliche Senden erledigt ein [`HttpTransport`]. So laufen die
//! Tests gegen dieselbe Fehlerklassifikation wie der echte Betrieb.

use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Delete,
}

impl Method {
    /// Schreibende Methoden werden bei unklarem Ausgang nicht blind wiederholt.
    pub fn is_write(self) -> bool {
        !matches!(self, Method::Get)
    }
}

#[derive(Debug, Clone)]
pub enum Body {
    None,
    Form(Vec<(String, String)>),
    Json(serde_json::Value),
}

#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: Method,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Body,
}

impl HttpRequest {
    pub fn new(method: Method, url: impl Into<String>) -> Self {
        Self { method, url: url.into(), headers: Vec::new(), body: Body::None }
    }
    pub fn header(mut self, k: &str, v: impl Into<String>) -> Self {
        self.headers.push((k.to_string(), v.into()));
        self
    }
    pub fn bearer(self, token: &str) -> Self {
        self.header("Authorization", format!("Bearer {token}"))
    }
    pub fn form(mut self, fields: Vec<(&str, String)>) -> Self {
        self.body = Body::Form(fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect());
        self
    }
    pub fn json(mut self, v: serde_json::Value) -> Self {
        self.body = Body::Json(v);
        self
    }
    pub fn header_value(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }
    /// URL ohne Query – für Logs (Query kann OAuth-Codes enthalten).
    pub fn url_for_log(&self) -> String {
        self.url.split('?').next().unwrap_or("").to_string()
    }
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn new(status: u16) -> Self {
        Self { status, headers: Vec::new(), body: Vec::new() }
    }
    pub fn json(status: u16, v: serde_json::Value) -> Self {
        Self {
            status,
            headers: vec![("content-type".into(), "application/json".into())],
            body: serde_json::to_vec(&v).unwrap_or_default(),
        }
    }
    pub fn with_header(mut self, k: &str, v: &str) -> Self {
        self.headers.push((k.to_string(), v.to_string()));
        self
    }
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }
    pub fn json_body(&self) -> Option<serde_json::Value> {
        serde_json::from_slice(&self.body).ok()
    }
}

#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq)]
pub enum TransportError {
    /// Verbindung kam nicht zustande (DNS, Verbindungsaufbau) – Anfrage wurde nicht gesendet.
    #[error("Verbindung fehlgeschlagen: {0}")]
    Connect(String),
    /// Zeitüberschreitung – die Anfrage kann bereits verarbeitet worden sein.
    #[error("Zeitüberschreitung: {0}")]
    Timeout(String),
    /// Sonstiger Fehler während der Übertragung – Ausgang unklar.
    #[error("Übertragungsfehler: {0}")]
    Other(String),
}

impl TransportError {
    /// Kann der Server die Anfrage trotz Fehler erhalten haben?
    pub fn possibly_delivered(&self) -> bool {
        !matches!(self, TransportError::Connect(_))
    }
}

#[async_trait]
pub trait HttpTransport: Send + Sync + 'static {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError>;
}

pub type SharedTransport = Arc<dyn HttpTransport>;

/// Echter Transport über `reqwest` mit festen Timeouts.
pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .pool_idle_timeout(Duration::from_secs(60))
            .user_agent(concat!("ON-AIR/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Self { client }
    }
}

impl Default for ReqwestTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let method = match req.method {
            Method::Get => reqwest::Method::GET,
            Method::Post => reqwest::Method::POST,
            Method::Put => reqwest::Method::PUT,
            Method::Delete => reqwest::Method::DELETE,
        };
        let mut rb = self.client.request(method, &req.url);
        for (k, v) in &req.headers {
            rb = rb.header(k, v);
        }
        rb = match req.body {
            Body::None => {
                if req.method.is_write() {
                    rb.header("Content-Length", "0")
                } else {
                    rb
                }
            }
            Body::Form(f) => rb.form(&f),
            Body::Json(v) => rb.json(&v),
        };
        let resp = rb.send().await.map_err(classify_reqwest)?;
        let status = resp.status().as_u16();
        let headers = resp
            .headers()
            .iter()
            .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let body = resp.bytes().await.map_err(classify_reqwest)?.to_vec();
        Ok(HttpResponse { status, headers, body })
    }
}

fn classify_reqwest(e: reqwest::Error) -> TransportError {
    // Keine URL in Fehlermeldungen: sie könnte Query-Parameter enthalten.
    let (connect, timeout) = (e.is_connect(), e.is_timeout());
    let msg = e.without_url().to_string();
    if connect {
        TransportError::Connect(msg)
    } else if timeout {
        TransportError::Timeout(msg)
    } else {
        TransportError::Other(msg)
    }
}

/// Programmierbarer Fake-Transport für Tests.
pub struct FakeTransport {
    handler: Mutex<Box<dyn FnMut(&HttpRequest) -> Result<HttpResponse, TransportError> + Send>>,
    pub log: Mutex<Vec<HttpRequest>>,
    delay: Mutex<Duration>,
}

impl FakeTransport {
    pub fn new(
        handler: impl FnMut(&HttpRequest) -> Result<HttpResponse, TransportError> + Send + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            handler: Mutex::new(Box::new(handler)),
            log: Mutex::new(Vec::new()),
            delay: Mutex::new(Duration::ZERO),
        })
    }
    pub fn set_handler(
        &self,
        handler: impl FnMut(&HttpRequest) -> Result<HttpResponse, TransportError> + Send + 'static,
    ) {
        *self.handler.lock().unwrap() = Box::new(handler);
    }
    pub fn set_delay(&self, d: Duration) {
        *self.delay.lock().unwrap() = d;
    }
    pub fn count(&self, pred: impl Fn(&HttpRequest) -> bool) -> usize {
        self.log.lock().unwrap().iter().filter(|r| pred(r)).count()
    }
    pub fn clear_log(&self) {
        self.log.lock().unwrap().clear();
    }
}

#[async_trait]
impl HttpTransport for FakeTransport {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let delay = *self.delay.lock().unwrap();
        if !delay.is_zero() {
            tokio::time::sleep(delay).await;
        }
        self.log.lock().unwrap().push(req.clone());
        (self.handler.lock().unwrap())(&req)
    }
}
