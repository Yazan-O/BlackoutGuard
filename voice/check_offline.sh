#!/usr/bin/env bash
# Written fresh during the event. Proves the money beat: local Gemma fills the advisory and the
# cached wav plays with no external network. Gemma/Piper weights = disclosed local tools; this
# proof is our event-built code. Egress-drop follows the vetted socket-proof recipe (no tcpdump).
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
GEMMA_MODEL="${GEMMA_MODEL:-gemma4:12b}"
PY="${PYTHON:-python3}"
FIX="contracts/fixtures/clip03.json"

say(){ printf '[check_offline] %s\n' "$*"; }
fail(){ printf '[check_offline] STOP: %s\n' "$*" >&2; exit 1; }

RESTORE=()
cleanup(){ [ ${#RESTORE[@]} -eq 0 ] && return 0; for c in "${RESTORE[@]}"; do eval "$c" >/dev/null 2>&1 || true; done; say "network restored."; }
trap cleanup EXIT INT TERM

IFACE=$(ip route 2>/dev/null | awk '/default/{print $5; exit}')
DROP_MODE=none
if [ -n "${IFACE:-}" ] && sudo -n iptables -S >/dev/null 2>&1; then
  DROP_MODE=iptables
fi

if [ "$DROP_MODE" = iptables ]; then
  say "dropping external egress on $IFACE (loopback kept) ..."
  sudo iptables -I OUTPUT -o lo -j ACCEPT;                 RESTORE+=('sudo iptables -D OUTPUT -o lo -j ACCEPT')
  if [ -n "${SSH_CONNECTION:-}" ]; then
    say "ssh session detected — keeping ESTABLISHED connections, dropping all NEW external egress"
    sudo iptables -I OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    RESTORE+=('sudo iptables -D OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT')
  fi
  sudo iptables -A OUTPUT -o "$IFACE" -j DROP;             RESTORE+=("sudo iptables -D OUTPUT -o $IFACE -j DROP")
  say "[1/4] proving the internet is unreachable ..."
  timeout 4 curl -s https://huggingface.co >/dev/null 2>&1 && fail "external still reachable — refusing to claim offline" || say "      external = BLOCKED"
else
  say "[1/4] egress-drop needs NET_ADMIN (this box can't modify iptables) — SKIPPED here."
  say "      Run on the demo console (host/laptop) for the physical-unplug pass; proving loopback-only below."
fi

say "[2/4] local Gemma fills the advisory (reasoning stays on the vehicle) ..."
curl -sf --max-time 180 "$OLLAMA_URL/api/chat" \
  -d "{\"model\":\"$GEMMA_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ready?\"}],\"stream\":false,\"think\":false,\"options\":{\"num_predict\":4}}" \
  >/dev/null 2>&1 || fail "local Gemma unreachable on $OLLAMA_URL"
ADV=$(OLLAMA_URL="$OLLAMA_URL" GEMMA_MODEL="$GEMMA_MODEL" "$PY" - "$FIX" <<'PY'
import sys, json
from agent.gemma_adapter import generate
recs = json.load(open(sys.argv[1], encoding="utf-8"))
rec = next((r for r in recs if r.get("severity") == "brake"), recs[-1])
d = rec["detections"][0]
msgs = [{"role":"system","content":"You are BlackoutGuard, an on-device driving-safety agent. Reply with ONE terse spoken driver warning, max 8 words, no preamble."},
        {"role":"user","content":f"Event camera flags a {d['class_name']} (conf {d['confidence']}); RGB blind {rec['blindness_duration_s']}s; severity={rec['severity']}."}]
print(generate(msgs).strip())
PY
) || fail "local Gemma did not answer (is ollama serving and $GEMMA_MODEL pulled?)"
[ -n "$ADV" ] || fail "local Gemma returned empty content (gemma4:12b reasoning-model failure) — refusing to claim the advisory was generated locally"
say "      Gemma (local): $ADV"

say "[3/4] cached advisory wav resolves — no synthesis, no network ..."
WAV=$("$PY" - "$FIX" <<'PY'
import sys, json
from voice.voice_iface import speak, SCRIPTED
recs = json.load(open(sys.argv[1], encoding="utf-8"))
rec = next((r for r in recs if r.get("severity") == "brake"), recs[-1])
text = SCRIPTED.get(rec["incident_id"]) or rec.get("advisory") or ""
print(speak(text, cache_key=rec["incident_id"]))
PY
) || fail "cached wav did not resolve"
[ -s "$WAV" ] || fail "wav missing or empty: $WAV"
say "      wav: $WAV ($(wc -c <"$WAV") bytes)"
if command -v aplay >/dev/null 2>&1 && aplay -l 2>/dev/null | grep -q '^card'; then
  aplay -q "$WAV" 2>/dev/null && say "      played on-device"
else
  say "      (no audio device on this box — the wav plays on the demo machine)"
fi

say "[4/4] proving Ollama is bound to loopback only ..."
LISTEN=$(ss -tlnH 2>/dev/null | awk '$4 ~ /:11434$/ {print $4}')
[ -n "$LISTEN" ] || fail "no Ollama listener on :11434"
# fail if ANY :11434 listener's local address is not loopback (catches 0.0.0.0, *, [::], routable IPs)
if echo "$LISTEN" | grep -qvE '^(127\.0\.0\.1|\[::1\]):11434$'; then
  echo "$LISTEN"; fail "Ollama is exposed on a non-loopback address — not offline-clean"
fi
say "      Ollama bound to loopback only ($(echo "$LISTEN" | tr '\n' ' '))"

echo
if [ "$DROP_MODE" = iptables ]; then
  echo "OFFLINE CHECK PASSED — advisory generated locally, cached wav played, no network."
else
  echo "OFFLINE CHECK (loopback proof) PASSED — local Gemma answered, cached wav resolved, Ollama bound to loopback."
  echo "The physical-unplug / egress-drop pass runs on the demo console (needs NET_ADMIN); this container can't drop egress."
fi
