//! Farben aus dem Cover des laufenden Titels – für die an den Song angepasste Live-Seite.
//!
//! Nur Spotify-Bildserver sind erlaubt (kein beliebiger Abruf), Bilder sind größenbegrenzt,
//! Ergebnisse werden zwischengespeichert. Die Berechnung ist bewusst einfach und schnell:
//! Vorschau auf 48×48 verkleinern, Pixel nach Farbton bündeln, gewichtet nach Sättigung und
//! Helligkeit; der stärkste Farbton wird die Akzentfarbe, der Durchschnitt die Grundtönung.

use crate::http::{HttpRequest, Method, SharedTransport};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

const MAX_BYTES: usize = 3 * 1024 * 1024;
const CACHE: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CoverColors {
    /// Kräftigste Farbe des Covers (RGB).
    pub vibrant: [u8; 3],
    /// Durchschnittsfarbe (RGB) – für großflächige Tönung.
    pub average: [u8; 3],
    /// Cover ist nahezu farblos (Schwarzweiß).
    pub muted: bool,
}

/// Erlaubte Bildquellen (Spotify-CDN).
pub fn allowed_url(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    if u.scheme() != "https" {
        return false;
    }
    let host = u.host_str().unwrap_or("");
    host == "i.scdn.co" || host.ends_with(".scdn.co") || host.ends_with(".spotifycdn.com")
}

fn rgb_to_hsv(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let h = if d == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / d).rem_euclid(6.0))
    } else if max == g {
        60.0 * ((b - r) / d + 2.0)
    } else {
        60.0 * ((r - g) / d + 4.0)
    };
    let s = if max == 0.0 { 0.0 } else { d / max };
    (h, s, max)
}

/// Farben aus Bilddaten (JPEG/PNG/WebP).
pub fn analyze(bytes: &[u8]) -> Option<CoverColors> {
    let img = image::load_from_memory(bytes).ok()?;
    let small = image::imageops::thumbnail(&img.to_rgb8(), 48, 48);
    const BUCKETS: usize = 24;
    let mut weight = [0f32; BUCKETS];
    let mut sum = [[0f32; 3]; BUCKETS];
    let mut avg = [0f32; 3];
    let mut n = 0f32;
    let mut sat_total = 0f32;
    for p in small.pixels() {
        let [r, g, b] = p.0;
        let (rf, gf, bf) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
        avg[0] += rf;
        avg[1] += gf;
        avg[2] += bf;
        n += 1.0;
        let (h, s, v) = rgb_to_hsv(rf, gf, bf);
        sat_total += s;
        // Sehr dunkle, sehr helle und graue Pixel zählen kaum.
        if v < 0.18 || s < 0.15 {
            continue;
        }
        let w = s * s * (1.0 - (v - 0.65).abs());
        let i = ((h / 360.0) * BUCKETS as f32) as usize % BUCKETS;
        weight[i] += w;
        sum[i][0] += rf * w;
        sum[i][1] += gf * w;
        sum[i][2] += bf * w;
    }
    if n == 0.0 {
        return None;
    }
    let to8 = |c: [f32; 3], d: f32| [(c[0] / d * 255.0).round() as u8, (c[1] / d * 255.0).round() as u8, (c[2] / d * 255.0).round() as u8];
    let average = to8(avg, n);
    // Nachbarn mitzählen, damit ein Farbton nicht an einer Bucket-Grenze zerfällt.
    let best = (0..BUCKETS)
        .max_by(|&a, &b| {
            let sc = |i: usize| weight[i] + 0.5 * (weight[(i + 1) % BUCKETS] + weight[(i + BUCKETS - 1) % BUCKETS]);
            sc(a).partial_cmp(&sc(b)).unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap_or(0);
    let muted = weight[best] < 0.5 || sat_total / n < 0.08;
    let vibrant = if muted { average } else { to8(sum[best], weight[best]) };
    Some(CoverColors { vibrant, average, muted })
}

#[derive(Default)]
pub struct PaletteCache {
    map: Mutex<HashMap<String, CoverColors>>,
}

impl PaletteCache {
    pub async fn colors(&self, http: &SharedTransport, url: &str) -> Result<CoverColors, String> {
        if !allowed_url(url) {
            return Err("Bildquelle nicht erlaubt".into());
        }
        if let Some(c) = self.map.lock().unwrap().get(url) {
            return Ok(*c);
        }
        let resp = http.send(HttpRequest::new(Method::Get, url.to_string())).await.map_err(|e| e.to_string())?;
        if resp.status != 200 || resp.body.len() > MAX_BYTES {
            return Err(format!("Cover nicht ladbar (HTTP {})", resp.status));
        }
        let body = resp.body;
        let colors = tokio::task::spawn_blocking(move || analyze(&body)).await.map_err(|e| e.to_string())?.ok_or("Cover nicht lesbar")?;
        let mut m = self.map.lock().unwrap();
        if m.len() >= CACHE {
            m.clear();
        }
        m.insert(url.to_string(), colors);
        Ok(colors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(pixels: &[[u8; 3]], w: u32, h: u32) -> Vec<u8> {
        let mut img = image::RgbImage::new(w, h);
        for (i, p) in img.pixels_mut().enumerate() {
            *p = image::Rgb(pixels[i % pixels.len()]);
        }
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img).write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn finds_the_dominant_vivid_color() {
        // Überwiegend dunkelgrauer Hintergrund mit kräftigem Blau: Blau gewinnt.
        let mut px = vec![[30, 30, 34]; 70];
        px.extend(vec![[40, 90, 220]; 30]);
        let c = analyze(&png(&px, 10, 10)).unwrap();
        assert!(!c.muted);
        assert!(c.vibrant[2] > 180 && c.vibrant[0] < 80, "{:?}", c.vibrant);
    }

    #[test]
    fn grayscale_cover_is_muted() {
        let c = analyze(&png(&[[20, 20, 20], [200, 200, 200]], 8, 8)).unwrap();
        assert!(c.muted);
    }

    #[test]
    fn only_spotify_image_hosts() {
        assert!(allowed_url("https://i.scdn.co/image/ab67616d0000b273"));
        assert!(allowed_url("https://mosaic.scdn.co/640/abc"));
        assert!(allowed_url("https://image-cdn-ak.spotifycdn.com/image/x"));
        assert!(!allowed_url("http://i.scdn.co/image/x"));
        assert!(!allowed_url("https://evil.example/i.scdn.co"));
        assert!(!allowed_url("https://127.0.0.1/x"));
    }
}
