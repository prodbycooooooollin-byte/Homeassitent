"""Lokale Spracherkennung (faster-whisper). Es werden keine Daten an Dritte gesendet."""
import numpy as np
from faster_whisper import WhisperModel


class Transcriber:
    def __init__(self, model: str = "small", language: str | None = "de"):
        self._model = WhisperModel(model, device="cpu", compute_type="int8")
        self._language = language or None

    @staticmethod
    def pcm_to_float(pcm: bytes) -> np.ndarray:
        """Discord liefert 48 kHz / stereo / int16 -> Whisper braucht 16 kHz / mono / float32."""
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        mono = audio[: len(audio) // 2 * 2].reshape(-1, 2).mean(axis=1)
        return mono[: len(mono) // 3 * 3].reshape(-1, 3).mean(axis=1).astype(np.float32)

    def transcribe(self, pcm: bytes) -> str:
        audio = self.pcm_to_float(pcm)
        if len(audio) < 16000 * 0.3:  # kürzer als 0,3 s ignorieren
            return ""
        segments, _ = self._model.transcribe(
            audio, language=self._language, vad_filter=True, beam_size=1, condition_on_previous_text=False
        )
        return " ".join(s.text for s in segments)
