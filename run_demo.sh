#!/usr/bin/env bash
# Written fresh during the event. Ollama/Gemma/Piper/whisper weights = disclosed local tools;
# this one-command launcher is our event-built code. Everything stays on localhost — no cloud.
set -uo pipefail
cd "$(dirname "$0")"

export OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/ollama-models}"
GEMMA_MODEL="${GEMMA_MODEL:-gemma4:12b}"    # laptop/edge tier: gemma4:e4b-it-qat
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
APP_URL="${APP_URL:-http://localhost:5173}"
AGENT_URL="${AGENT_URL:-http://localhost:8000}"
PY="${PYTHON:-python3}"

say(){ printf '[run_demo] %s\n' "$*"; }
fail(){ printf '[run_demo] STOP: %s\n' "$*" >&2; exit 1; }

command -v ollama >/dev/null || fail "ollama not installed — run: curl -fsSL https://ollama.com/install.sh | sh"

if ! curl -sf "$OLLAMA_URL/api/version" >/dev/null 2>&1; then
  say "starting ollama (models on $OLLAMA_MODELS) ..."
  mkdir -p "$OLLAMA_MODELS"
  nohup env OLLAMA_MODELS="$OLLAMA_MODELS" ollama serve >"$HOME/ollama-serve.log" 2>&1 &
  for _ in $(seq 30); do curl -sf "$OLLAMA_URL/api/version" >/dev/null 2>&1 && break; sleep 1; done
fi
curl -sf "$OLLAMA_URL/api/version" >/dev/null 2>&1 || fail "ollama did not come up on $OLLAMA_URL"

if ! ollama list | grep -qF "$GEMMA_MODEL"; then
  say "pulling $GEMMA_MODEL (one-time, needs network) ..."
  ollama pull "$GEMMA_MODEL" || fail "could not pull $GEMMA_MODEL"
fi

say "warming $GEMMA_MODEL (loads weights to GPU; first load can take ~1 min) ..."
curl -sf --max-time 180 "$OLLAMA_URL/api/chat" \
  -d "{\"model\":\"$GEMMA_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ready?\"}],\"stream\":false,\"options\":{\"num_predict\":4}}" \
  >/dev/null || fail "$GEMMA_MODEL did not answer locally"
say "Gemma answering locally ($GEMMA_MODEL on $OLLAMA_URL)"

ls voice/cache/*.wav >/dev/null 2>&1 || say "warning: no pre-rendered advisories in voice/cache/ — run: $PY -m voice.voice_iface"

AGENT_UP=no
if [ -f agent/run.py ]; then
  say "starting agent server on $AGENT_URL ..."
  agent_port="${AGENT_URL##*:}"
  AGENT_PORT="$agent_port" nohup "$PY" agent/run.py >"$HOME/bg-agent.log" 2>&1 &
  # health-check the loopback IPv4 the agent binds (127.0.0.1), not localhost (Windows resolves it ::1 first)
  for _ in $(seq 30); do curl -sf "http://127.0.0.1:$agent_port/health" >/dev/null 2>&1 && { AGENT_UP=yes; break; }; sleep 1; done
  [ "$AGENT_UP" = yes ] || say "warning: agent did not answer on http://127.0.0.1:$agent_port/health (see $HOME/bg-agent.log)"
else
  say "note: agent/run.py not present (Lane 2) — operator Q&A will be local-only"
fi

APP_UP=no
if [ -f app/package.json ]; then
  if command -v npm >/dev/null; then
    [ -d app/node_modules ] || { say "installing app deps (one-time) ..."; ( cd app && npm install >"$HOME/bg-app-install.log" 2>&1 ); }
    say "starting web app (vite) on $APP_URL ..."
    ( cd app && VITE_AGENT_URL="$AGENT_URL" nohup npm run dev >"$HOME/bg-app.log" 2>&1 & )
    for _ in $(seq 30); do curl -sf "$APP_URL" >/dev/null 2>&1 && { APP_UP=yes; break; }; sleep 1; done
    [ "$APP_UP" = yes ] || say "warning: app did not answer on $APP_URL yet (see $HOME/bg-app.log)"
  else
    say "note: npm not found — install Node to serve app/ (Lane 3)"
  fi
else
  say "note: app/ not present yet (Lane 3) — skipping web app"
fi

if [ "$APP_UP" = yes ]; then
  for opener in xdg-open wslview open; do command -v "$opener" >/dev/null && { "$opener" "$APP_URL" >/dev/null 2>&1 &  break; }; done
fi

echo
if [ "$AGENT_UP" = yes ] && [ "$APP_UP" = yes ]; then
  echo "ALL LOCAL — SAFE TO UNPLUG"
else
  miss=""; [ "$AGENT_UP" = no ] && miss+=" agent(Lane2)"; [ "$APP_UP" = no ] && miss+=" app(Lane3)"
  echo "PARTIAL STACK — Ollama+Gemma up and local; not up:$miss"
  echo "(Gemma answers locally now; the full 'ALL LOCAL — SAFE TO UNPLUG' fires once agent+app are up.)"
fi
