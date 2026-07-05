# Gemma reasoning backend. Default = local Ollama: the product path — offline, on-device, no keys.
# The vehicle always runs GEMMA_BACKEND=ollama with an on-device Gemma 4 tier (E4B by default).
#
# A dev/test-only switch (GEMMA_BACKEND=openai) lets a machine WITHOUT Ollama exercise the live-model
# paths (/ask, uncached advisories) against any OpenAI-compatible endpoint that serves Gemma 4 — e.g.
# OpenRouter (free) or Google AI Studio. This never touches the product path.
#
# Uses only the Python stdlib (urllib) — a fresh clone runs the agent with zero pip installs.
import json, os, urllib.request

GEMMA_BACKEND = os.environ.get("GEMMA_BACKEND", "ollama").lower()
GEMMA_MODEL   = os.environ.get("GEMMA_MODEL", "gemma4:e4b-it-qat")   # on-device edge tier; bigger box: gemma4:12b
OLLAMA_URL    = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# Dev/test only (never the product path): any OpenAI-compatible /chat/completions endpoint serving
# Gemma 4. The on-device E4B tier is not sold as a cloud endpoint (that is the point of an edge model),
# so the cloud test uses the closest sibling Google ships as an API — the 26B-A4B (4B active) tier.
#   OpenRouter (free)    OPENAI_BASE_URL=https://openrouter.ai/api/v1                             OPENAI_MODEL=google/gemma-4-26b-a4b-it:free
#   Google AI Studio     OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai  OPENAI_MODEL=gemma-4-26b-a4b-it
#   local vLLM/LM Studio OPENAI_BASE_URL=http://localhost:1234/v1                                 OPENAI_MODEL=<served-name>
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENAI_MODEL    = os.environ.get("OPENAI_MODEL", "google/gemma-4-26b-a4b-it:free")
OPENAI_API_KEY  = os.environ.get("OPENAI_API_KEY", "")


def _post(url, payload, headers=None, timeout=60):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"content-type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _ollama(messages, temperature, max_tokens):
    # think:false — Gemma 4 is a reasoning model; with thinking on it spends the token budget on
    # hidden reasoning and returns empty content intermittently. Off returns the terse advisory directly.
    out = _post(f"{OLLAMA_URL}/api/chat", {
        "model": GEMMA_MODEL, "messages": messages, "stream": False, "think": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    })
    return out["message"]["content"]


def _openai(messages, temperature, max_tokens):
    if not OPENAI_API_KEY:
        raise RuntimeError("GEMMA_BACKEND=openai needs OPENAI_API_KEY (dev/test only; the product uses ollama).")
    out = _post(f"{OPENAI_BASE_URL}/chat/completions", {
        "model": OPENAI_MODEL, "messages": messages, "stream": False,
        "temperature": temperature, "max_tokens": max_tokens,
    }, headers={"authorization": f"Bearer {OPENAI_API_KEY}"})
    return out["choices"][0]["message"]["content"]


_BACKENDS = {"ollama": _ollama, "openai": _openai}


def generate(messages, *, temperature=0.2, max_tokens=256):
    backend = _BACKENDS.get(GEMMA_BACKEND)
    if backend is None:
        raise RuntimeError(f"unknown GEMMA_BACKEND={GEMMA_BACKEND!r} (use ollama|openai)")
    return backend(messages, temperature, max_tokens)
