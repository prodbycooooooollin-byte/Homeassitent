//! PKCE (RFC 7636) für die Spotify-Anmeldung einer öffentlichen Desktop-App.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::Rng;
use sha2::{Digest, Sha256};

const UNRESERVED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

#[derive(Debug, Clone)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

fn random_string(len: usize) -> String {
    let mut rng = rand::rng();
    (0..len).map(|_| UNRESERVED[rng.random_range(0..UNRESERVED.len())] as char).collect()
}

/// Verifier mit 64 Zeichen (erlaubt: 43–128), Challenge = BASE64URL(SHA256(verifier)).
pub fn generate() -> PkcePair {
    let verifier = random_string(64);
    let challenge = challenge_for(&verifier);
    PkcePair { verifier, challenge }
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Zufälliger OAuth-`state` gegen CSRF/Code-Injection.
pub fn random_state() -> String {
    random_string(32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc7636_example_vector() {
        // Beispiel aus RFC 7636, Anhang B.
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn verifier_is_valid() {
        let p = generate();
        assert_eq!(p.verifier.len(), 64);
        assert!(p.verifier.bytes().all(|b| UNRESERVED.contains(&b)));
        assert_eq!(p.challenge, challenge_for(&p.verifier));
    }
}
