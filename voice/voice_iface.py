# Written fresh during the event. Piper voice weights = a disclosed local tool;
# this interface + the wav cache is our event-built code.
import os, sys, json, subprocess, hashlib
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
PIPER_VOICE = os.environ.get("PIPER_VOICE", str(Path(__file__).parent / "models" / "en_US-ryan-high.onnx"))


def _cache_path(cache_key: str) -> Path:
    return CACHE_DIR / f"{cache_key}.wav"


def speak(text: str, *, cache_key: str | None = None) -> str:
    """Return path to a wav for `text`. Default impl = Piper (offline, on-device).
    Optional impl = Gradium (cloud, UI-layer only), selected by env VOICE_BACKEND=piper|gradium (default piper).
    If cache_key hits voice/cache/, return the cached wav path — never re-synthesize (determinism + dead-network safety)."""
    key = cache_key or hashlib.sha1(text.encode()).hexdigest()[:16]
    out = _cache_path(key)
    if out.exists():
        return str(out)
    backend = os.environ.get("VOICE_BACKEND", "piper")
    if backend == "piper":
        subprocess.run([sys.executable, "-m", "piper", "--model", PIPER_VOICE, "--output_file", str(out)],
                       input=text.encode("utf-8"), env={**os.environ, "PYTHONUTF8": "1"}, check=True)
    else:
        from voice.gradium_backend import synth   # optional UI layer a teammate drops in; never on the safety path
        synth(text, str(out))
    return str(out)


# The demo's scripted spoken advisories, keyed by incident_id (the video's money lines). Fixtures carry
# advisory=null until Gemma fills it live; the cache is keyed by incident_id, so a hit plays this canonical
# line whatever Gemma generates at runtime.
SCRIPTED = {"clip03-000148": "Brake — pedestrian, left."}


def prerender_from_fixtures(fixtures_dir="contracts/fixtures"):
    """Bake a wav for every scripted demo advisory so the beat plays with no synthesis and no network.
    Renders the scripted money lines plus any advisory already baked into a fixture."""
    lines = dict(SCRIPTED)
    for fx in sorted(Path(fixtures_dir).glob("*.json")):
        for rec in json.loads(fx.read_text(encoding="utf-8")):
            if rec.get("advisory"):
                lines[rec["incident_id"]] = rec["advisory"]
    return [speak(text, cache_key=k) for k, text in lines.items()]


if __name__ == "__main__":
    for wav in prerender_from_fixtures(*sys.argv[1:2]):
        print(wav)
