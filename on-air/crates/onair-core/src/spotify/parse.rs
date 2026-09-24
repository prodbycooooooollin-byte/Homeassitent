//! Tolerantes Parsen der Spotify-Antworten. Fehlende Felder (z. B. nach den
//! Development-Mode-Änderungen vom Februar 2026) führen nicht zu Fehlern.

use crate::model::{Actions, Device, EpisodeInfo, Playback, Provider, Track};
use serde_json::Value;

pub fn parse_track(v: &Value) -> Option<Track> {
    if v.is_null() || v["type"].as_str().is_some_and(|t| t != "track") {
        return None;
    }
    let id = v["id"].as_str()?.to_string();
    let uri = v["uri"].as_str().map(str::to_string).unwrap_or_else(|| format!("spotify:track:{id}"));
    let artists = v["artists"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x["name"].as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    // Größtes Bild ≤ 640 px bevorzugen; Seitenverhältnis bleibt im UI erhalten.
    let image_url = v["album"]["images"].as_array().and_then(|imgs| {
        imgs.iter()
            .filter(|i| i["width"].as_u64().map(|w| w <= 640).unwrap_or(true))
            .max_by_key(|i| i["width"].as_u64().unwrap_or(0))
            .or_else(|| imgs.first())
            .and_then(|i| i["url"].as_str().map(str::to_string))
    });
    Some(Track {
        provider: Provider::Spotify,
        id,
        uri,
        title: v["name"].as_str().unwrap_or("Unbekannter Titel").to_string(),
        artists,
        album: v["album"]["name"].as_str().map(str::to_string),
        image_url,
        duration_ms: v["duration_ms"].as_u64().unwrap_or(0),
        explicit: v["explicit"].as_bool().unwrap_or(false),
        external_url: v["external_urls"]["spotify"].as_str().map(str::to_string),
    })
}

pub fn parse_episode(v: &Value) -> Option<EpisodeInfo> {
    if v["type"].as_str() != Some("episode") {
        return None;
    }
    let images = v["images"].as_array().or(v["show"]["images"].as_array());
    Some(EpisodeInfo {
        title: v["name"].as_str()?.to_string(),
        show: v["show"]["name"].as_str().map(str::to_string),
        image_url: images.and_then(|i| i.first()).and_then(|i| i["url"].as_str().map(str::to_string)),
        duration_ms: v["duration_ms"].as_u64().unwrap_or(0),
        external_url: v["external_urls"]["spotify"].as_str().map(str::to_string),
    })
}

pub fn parse_device(v: &Value) -> Option<Device> {
    Some(Device {
        id: v["id"].as_str().map(str::to_string),
        name: v["name"].as_str()?.to_string(),
        kind: v["type"].as_str().unwrap_or("Unknown").to_string(),
        is_active: v["is_active"].as_bool().unwrap_or(false),
        is_restricted: v["is_restricted"].as_bool().unwrap_or(false),
        volume_percent: v["volume_percent"].as_u64().map(|x| x.min(100) as u8),
    })
}

pub fn parse_playback(v: &Value, fetched_at_ms: i64) -> Playback {
    let dis = &v["actions"]["disallows"];
    let not = |k: &str| !dis[k].as_bool().unwrap_or(false);
    Playback {
        is_playing: v["is_playing"].as_bool().unwrap_or(false),
        track: parse_track(&v["item"]),
        episode: parse_episode(&v["item"]),
        item_type: v["currently_playing_type"].as_str().map(str::to_string),
        progress_ms: v["progress_ms"].as_u64().unwrap_or(0),
        device: parse_device(&v["device"]),
        shuffle: v["shuffle_state"].as_bool().unwrap_or(false),
        repeat: v["repeat_state"].as_str().unwrap_or("off").to_string(),
        actions: Actions {
            can_skip_next: not("skipping_next"),
            can_skip_prev: not("skipping_prev"),
            can_pause: not("pausing"),
            can_resume: not("resuming"),
        },
        fetched_at_ms,
    }
}
