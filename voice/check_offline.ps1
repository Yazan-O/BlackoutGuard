# Written fresh during the event. Windows mirror of voice/check_offline.sh for the demo laptop: proves the
# money beat — local Gemma fills the advisory and the cached wav resolves with no external network.
# -Drop physically disables the active adapter (admin; the real on-camera beat) and restores it at the end;
# without it, the repeatable loopback proof runs (safe, does not cut your connection).
param([switch]$Drop)
Set-Location (Split-Path $PSScriptRoot -Parent)
$OllamaUrl  = if ($env:OLLAMA_URL)  { $env:OLLAMA_URL }  else { "http://localhost:11434" }
$GemmaModel = if ($env:GEMMA_MODEL) { $env:GEMMA_MODEL } else { "gemma4:e4b-it-qat" }
$AgentUrl   = if ($env:AGENT_URL)   { $env:AGENT_URL }   else { "http://127.0.0.1:8000" }
$py = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "py" }

function Say($m)  { Write-Host "[check_offline] $m" }
function Fail($m) { Write-Host "[check_offline] STOP: $m" -ForegroundColor Red; exit 1 }

$adapter = $null
try {
  if ($Drop) {
    $adapter = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
    if (-not $adapter) { Fail "no active adapter to drop" }
    Say "dropping $($adapter.Name) (real unplug; restored at the end) ..."
    Disable-NetAdapter -Name $adapter.Name -Confirm:$false
    Start-Sleep 2
    $online = try { Invoke-RestMethod "https://huggingface.co" -TimeoutSec 4 | Out-Null; $true } catch { $false }
    if ($online) { Fail "external still reachable - refusing to claim offline" } else { Say "[1/4] external = BLOCKED" }
  } else {
    Say "[1/4] real egress-drop needs admin and cuts your connection - pass -Drop on the demo console for the physical beat; proving loopback-only below."
  }

  Say "[2/4] local Gemma fills the advisory + [3/4] cached wav resolves ..."
  $env:GEMMA_MODEL = $GemmaModel; $env:OLLAMA_URL = $OllamaUrl
  $probe = @'
import sys, json
sys.path.insert(0, ".")
from agent.gemma_adapter import generate
from voice.voice_iface import speak, SCRIPTED
recs = json.load(open("contracts/fixtures/clip03.json", encoding="utf-8"))
rec = next((r for r in recs if r.get("severity") == "brake"), recs[-1])
d = rec["detections"][0]
adv = generate([{"role": "system", "content": "You are BlackoutGuard, an on-device driving-safety agent. Reply with ONE terse spoken driver warning, max 8 words, no preamble."},
                {"role": "user", "content": f"Event camera flags a {d['class_name']} (conf {d['confidence']}); RGB blind {rec['blindness_duration_s']}s; severity={rec['severity']}."}]).strip()
if not adv:
    sys.exit("EMPTY_ADVISORY")
text = SCRIPTED.get(rec["incident_id"]) or rec.get("advisory") or ""
print(json.dumps({"advisory": adv, "wav": speak(text, cache_key=rec["incident_id"])}))
'@
  $out = $probe | & $py -
  if ($LASTEXITCODE -ne 0) { Fail "local Gemma/advisory probe failed (empty content or Ollama down)" }
  $r = $out | ConvertFrom-Json
  Say "      Gemma (local): $($r.advisory)"
  if (-not (Test-Path $r.wav) -or (Get-Item $r.wav).Length -eq 0) { Fail "cached wav missing or empty: $($r.wav)" }
  Say "      wav: $($r.wav) ($((Get-Item $r.wav).Length) bytes)"

  Say "[4/4] proving Ollama is bound to loopback only ..."
  $listen = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
  if (-not $listen) { Fail "no Ollama listener on :11434" }
  $exposed = $listen | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }
  if ($exposed) { $exposed | Format-Table LocalAddress, LocalPort | Out-String | Write-Host; Fail "Ollama exposed on a non-loopback address" }
  Say "      Ollama bound to loopback only ($((($listen.LocalAddress | Select-Object -Unique) -join ', ')))"

  Say "[full-stack] operator Q&A via the agent server ($AgentUrl/ask) ..."
  $agentUp = try { Invoke-RestMethod "$AgentUrl/health" -TimeoutSec 3 | Out-Null; $true } catch { $false }
  if ($agentUp) {
    $q = @{ question = "How many distinct pedestrians were flagged tonight, and were we blinded?" } | ConvertTo-Json -Compress
    $ans = try { (Invoke-RestMethod "$AgentUrl/ask" -Method Post -Body $q -ContentType application/json -TimeoutSec 60).answer } catch { "" }
    if (-not $ans) { Fail "agent /ask returned no answer (Gemma down through the agent?)" }
    Say "      agent answer: $ans"
  } else { Say "      agent server not up on $AgentUrl - bring the stack up with run_demo first (this step proves offline Q&A)" }

  Write-Host ""
  if ($Drop) {
    Write-Host ("OFFLINE CHECK PASSED " + [char]0x2014 + " advisory generated locally, cached wav played, no network.")
  } else {
    Write-Host ("OFFLINE CHECK (loopback proof) PASSED " + [char]0x2014 + " local Gemma answered, cached wav resolved, Ollama bound to loopback.")
    Write-Host "Pass -Drop on the demo console (admin) for the physical-unplug pass."
  }
}
finally {
  if ($adapter) { Enable-NetAdapter -Name $adapter.Name -Confirm:$false; Say "network restored." }
}
