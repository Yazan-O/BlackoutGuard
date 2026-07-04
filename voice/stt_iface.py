# Written fresh during the event. faster-whisper weights = a disclosed local tool;
# this interface is our event-built code. The model is pulled once while online, then runs offline.
import os
from functools import lru_cache

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")


@lru_cache(maxsize=1)
def _model():
    from faster_whisper import WhisperModel
    return WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")


def transcribe(wav_path: str) -> str:
    """Operator question wav -> text. Default impl = faster-whisper (offline, on-device).
    Optional impl = Gradium STT, selected by env STT_BACKEND=whisper|gradium (default whisper)."""
    if os.environ.get("STT_BACKEND", "whisper") == "whisper":
        segments, _ = _model().transcribe(wav_path)
        return " ".join(s.text.strip() for s in segments).strip()
    from voice.gradium_backend import transcribe as gradium_transcribe   # optional UI layer, never on safety path
    return gradium_transcribe(wav_path)
