import { useEffect, useRef } from 'react';
import { buildTikTokEmbedUrl, TIKTOK_PLAYER_ORIGIN } from '@liked/protocol';
import type { ClipPlayerProps } from './types';

/**
 * Offizieller TikTok Embed Player v1 (https://www.tiktok.com/player/v1/{id}).
 * Kommunikation ausschließlich über dokumentierte postMessage-Nachrichten:
 *   Ereignisse: onPlayerReady, onStateChange (-1 init, 0 ended, 1 playing, 2 paused, 3 buffering),
 *               onCurrentTime, onMute, onVolumeChange, onError
 *   Befehle:    play, pause, seekTo, mute, unMute
 * Es gibt KEINEN Befehl zum Setzen der Lautstärke – dafür dient der Regler im Player.
 * Eingehende Nachrichten werden auf Herkunft (Origin + Quellfenster) und Form geprüft.
 */
type PlayerMsg = { 'x-tiktok-player': true; type: string; value?: unknown };

function isPlayerMsg(data: unknown): data is PlayerMsg {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)['x-tiktok-player'] === true &&
    typeof (data as Record<string, unknown>).type === 'string' &&
    ((data as Record<string, unknown>).type as string).length < 40
  );
}

export function TikTokEmbed({ clip, loadKey, startAtLocal, stopAtLocal, startMuted, onReady, onLoadFailed, onPlayback }: ClipPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const st = useRef({ ready: false, started: false, buffering: false, position: 0, failed: false });
  const cb = useRef({ onReady, onLoadFailed, onPlayback });
  cb.current = { onReady, onLoadFailed, onPlayback };

  const post = (type: string, value?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage({ 'x-tiktok-player': true, type, ...(value !== undefined ? { value } : {}) }, TIKTOK_PLAYER_ORIGIN);
  };

  useEffect(() => {
    st.current = { ready: false, started: false, buffering: false, position: 0, failed: false };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== TIKTOK_PLAYER_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      if (!isPlayerMsg(e.data)) return;
      const s = st.current;
      switch (e.data.type) {
        case 'onPlayerReady':
          if (!s.ready) {
            s.ready = true;
            if (startMuted) post('mute');
            cb.current.onReady();
          }
          break;
        case 'onStateChange': {
          const v = Number(e.data.value);
          if (v === 1) {
            if (!s.started) {
              s.started = true;
              cb.current.onPlayback('started', s.position);
            } else if (s.buffering) {
              s.buffering = false;
              cb.current.onPlayback('resumed', s.position);
            }
          } else if (v === 3 && s.started && !s.buffering) {
            s.buffering = true;
            cb.current.onPlayback('buffering', s.position);
          }
          break;
        }
        case 'onCurrentTime': {
          const val = e.data.value as { currentTime?: unknown } | undefined;
          if (val && typeof val.currentTime === 'number' && Number.isFinite(val.currentTime)) s.position = val.currentTime;
          break;
        }
        case 'onError':
          if (!s.ready && !s.failed) {
            s.failed = true;
            cb.current.onLoadFailed('unavailable');
          } else if (s.ready) cb.current.onPlayback('error', s.position);
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clip.videoId, loadKey, startMuted]);

  // Gemeinsamer Start zum Serverzeitpunkt.
  useEffect(() => {
    if (!startAtLocal) return;
    const delay = startAtLocal - Date.now();
    const h = window.setTimeout(() => {
      post('seekTo', 0);
      post('play');
    }, Math.max(0, delay));
    return () => window.clearTimeout(h);
  }, [startAtLocal, loadKey]);

  // Längere Clips auf das Rundenfenster begrenzen; danach keine weiteren Videos.
  useEffect(() => {
    if (!stopAtLocal) return;
    const h = window.setTimeout(() => post('pause'), Math.max(0, stopAtLocal - Date.now()));
    return () => window.clearTimeout(h);
  }, [stopAtLocal, loadKey]);

  // Beim Entfernen anhalten; das iframe wird mit der Runde freigegeben.
  useEffect(() => () => post('pause'), []);

  return (
    <iframe
      ref={iframeRef}
      key={`${clip.videoId}:${loadKey}`}
      className="clip-iframe"
      src={buildTikTokEmbedUrl(clip.videoId, { autoplay: false, muted: false })}
      title="TikTok-Clip"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation"
    />
  );
}
