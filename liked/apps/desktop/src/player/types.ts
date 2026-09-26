import type { ClipRef } from '@liked/protocol';

export interface ClipPlayerProps {
  clip: ClipRef;
  /** Wechselt bei jedem Ladeversuch → Player wird neu erzeugt. */
  loadKey: string;
  /** Lokale Zeit (ms), zu der gestartet wird; null = noch nicht geplant. */
  startAtLocal: number | null;
  /** Lokale Zeit (ms), zu der die Wiedergabe endet (Rundenfenster). */
  stopAtLocal: number | null;
  startMuted: boolean;
  onReady(): void;
  onLoadFailed(reason: 'unavailable' | 'timeout' | 'network' | 'unknown'): void;
  onPlayback(kind: 'started' | 'buffering' | 'resumed' | 'error', position: number): void;
}
