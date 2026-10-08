"""Lokale Spracherkennung (faster-whisper). Es werden keine Daten an Dritte gesendet."""
import os

import numpy as np
from faster_whisper import WhisperModel

# Whisper rät bei Umgangssprache oft Wörter, die ähnlich klingen ("droppen" -> "jobben").
# Ein Einstiegstext mit dem typischen Wortschatz macht diese Wörter wahrscheinlicher.
# Eigene Wörter lassen sich in der .env mit WHISPER_PROMPT ergänzen.
DEFAULT_PROMPT = (
    "Unterhaltung unter Freunden auf Discord, Umgangssprache und Gaming-Slang: "
    "droppen, gedroppt, Lobby, Squad, Clip, Bro, Alter, Digga, krass, safe, Wallah, "
    "random, gamen, zocken, Ranked, Loot, Sweat, lowkey, highkey, cringe."
)


class Transcriber:
    def __init__(self, model: str = "medium", language: str | None = "de"):
        self._model = WhisperModel(model, device="cpu", compute_type="int8")
        self._language = language or None
        self._prompt = os.getenv("WHISPER_PROMPT", DEFAULT_PROMPT) or None

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
            audio,
            language=self._language,
            beam_size=5,  # genauer als 1, etwas langsamer
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300, "speech_pad_ms": 200},
            condition_on_previous_text=False,
            initial_prompt=self._prompt,
            temperature=(0.0, 0.2),
            no_speech_threshold=0.6,
        )
        return " ".join(s.text for s in segments)
