//! Interner Ereignisbus. Die Desktop-Hülle leitet Änderungen gebündelt an die UI weiter.

use serde::Serialize;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Topic {
    Spotify,
    Twitch,
    Queue,
    Activity,
    Settings,
    Overlay,
    History,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    Changed { topic: Topic },
    Activity(crate::activity::Activity),
}

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<AppEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(512);
        Self { tx }
    }
    pub fn emit(&self, ev: AppEvent) {
        let _ = self.tx.send(ev);
    }
    pub fn changed(&self, topic: Topic) {
        self.emit(AppEvent::Changed { topic });
    }
    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.tx.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
