# Written fresh during the event. Ollama/Gemma/Piper/whisper weights = disclosed local tools;
# this one-command launcher is our event-built code. Everything stays on localhost, no cloud.
Set-Location $PSScriptRoot
$BANNER = "ALL LOCAL " + [char]0x2014 + " SAFE TO UNPLUG"

if (-not $env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = Join-Path $HOME "ollama-models" }
$GemmaModel = if ($env:GEMMA_MODEL) { $env:GEMMA_MODEL } else { "gemma4:12b" }
$OllamaUrl  = if ($env:OLLAMA_URL)  { $env:OLLAMA_URL }  else { "http://localhost:11434" }
$AppUrl     = if ($env:APP_URL)     { $env:APP_URL }     else { "http://localhost:5173" }
$AgentUrl   = if ($env:AGENT_URL)   { $env:AGENT_URL }   else { "http://localhost:8000" }

function Say($m)  { Write-Host "[run_demo] $m" }
function Fail($m) { Write-Host "[run_demo] STOP: $m" -ForegroundColor Red; exit 1 }
function OllamaUp { try { Invoke-RestMethod "$OllamaUrl/api/version" -TimeoutSec 3 | Out-Null; $true } catch { $false } }

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { Fail "ollama not installed - get it from https://ollama.com/download/windows" }

if (-not (OllamaUp)) {
  Say "starting ollama (models on $env:OLLAMA_MODELS) ..."
  New-Item -ItemType Directory -Force -Path $env:OLLAMA_MODELS | Out-Null
  Start-Process -WindowStyle Hidden ollama -ArgumentList "serve"
  foreach ($i in 1..30) { if (OllamaUp) { break }; Start-Sleep 1 }
}
if (-not (OllamaUp)) { Fail "ollama did not come up on $OllamaUrl" }

if (-not ((ollama list) -match [regex]::Escape($GemmaModel))) {
  Say "pulling $GemmaModel (one-time, needs network) ..."
  ollama pull $GemmaModel
  if ($LASTEXITCODE -ne 0) { Fail "could not pull $GemmaModel" }
}

Say "warming $GemmaModel (loads weights to GPU; first load can take ~1 min) ..."
$body = @{ model=$GemmaModel; messages=@(@{role="user";content="ready?"}); stream=$false; think=$false; options=@{num_predict=4} } | ConvertTo-Json -Depth 5
try { Invoke-RestMethod "$OllamaUrl/api/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 180 | Out-Null }
catch { Fail "$GemmaModel did not answer locally" }
Say "Gemma answering locally ($GemmaModel on $OllamaUrl)"

if (-not (Get-ChildItem voice\cache\*.wav -ErrorAction SilentlyContinue)) { Say "warning: no pre-rendered advisories in voice/cache/ - run: python -m voice.voice_iface" }

$AgentUp = $false
if (Test-Path agent\run.py) {
  Say "starting agent server on $AgentUrl ..."
  $agentPort = ($AgentUrl -split ':')[-1]
  $env:AGENT_PORT = $agentPort
  Start-Process -WindowStyle Hidden python -ArgumentList "agent\run.py" -RedirectStandardOutput "$HOME\bg-agent.log" -RedirectStandardError "$HOME\bg-agent.err.log"
  # health-check the loopback IPv4 the agent binds (127.0.0.1), not localhost (Windows resolves it ::1 first)
  foreach ($i in 1..30) { try { Invoke-RestMethod "http://127.0.0.1:$agentPort/health" -TimeoutSec 2 | Out-Null; $AgentUp=$true; break } catch { Start-Sleep 1 } }
  if (-not $AgentUp) { Say "warning: agent did not answer on http://127.0.0.1:$agentPort/health" }
} else { Say "note: agent/run.py not present (Lane 2) - operator Q&A local-only" }

$AppUp = $false
if (Test-Path app\package.json) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path app\node_modules)) { Say "installing app deps (one-time) ..."; Push-Location app; npm install *> $HOME\bg-app-install.log; Pop-Location }
    Say "starting web app (vite) on $AppUrl ..."
    $env:VITE_AGENT_URL = $AgentUrl
    Start-Process -WindowStyle Hidden -WorkingDirectory app npm -ArgumentList "run","dev"
    foreach ($i in 1..30) { try { Invoke-WebRequest $AppUrl -TimeoutSec 2 -UseBasicParsing | Out-Null; $AppUp=$true; break } catch { Start-Sleep 1 } }
    if (-not $AppUp) { Say "warning: app did not answer on $AppUrl yet" }
  } else { Say "note: npm not found - install Node to serve app/ (Lane 3)" }
} else { Say "note: app/ not present yet (Lane 3) - skipping web app" }

if ($AppUp) { Start-Process $AppUrl }

Write-Host ""
if ($AgentUp -and $AppUp) {
  Write-Host $BANNER
} else {
  $miss = ""
  if (-not $AgentUp) { $miss += " agent(Lane2)" }
  if (-not $AppUp)   { $miss += " app(Lane3)" }
  Write-Host "PARTIAL STACK - Ollama+Gemma up and local; not up:$miss"
  Write-Host "(Gemma answers locally now; the full '$BANNER' fires once agent+app are up.)"
}
