# Owned by Lane 2 (situational agent). Seeded from the frozen CONTRACT 2 by Lane 4 so the launcher
# and offline-proof are testable before Lane 2 lands. Local Ollama only, no keys.
# One deviation from the verbatim contract, flagged for Lane 2: gemma4:12b is a reasoning model — with
# thinking on it spends the token budget on hidden reasoning and returns EMPTY content intermittently
# (done_reason=length). "think": false returns the terse advisory directly. Keep it, or handle empty content.
import os, requests
GEMMA_MODEL = os.environ.get("GEMMA_MODEL", "gemma4:12b")   # laptop tier: gemma4:e4b-it-qat
OLLAMA_URL  = os.environ.get("OLLAMA_URL", "http://localhost:11434")
def generate(messages, *, temperature=0.2, max_tokens=256):
    r = requests.post(f"{OLLAMA_URL}/api/chat", json={"model": GEMMA_MODEL, "messages": messages, "stream": False,
        "think": False, "options": {"temperature": temperature, "num_predict": max_tokens}}, timeout=60)
    r.raise_for_status()
    return r.json()["message"]["content"]
