# Lane 4 — voice + one-command integration

Built during the event. Piper / faster-whisper / Gemma 4 / Ollama weights are disclosed local tools;
the interfaces, wav cache, launcher, and offline-proof are event-built.

## CP1 — Gemma live on yorha (unblocks Lane 2)
- **Model tag confirmed empirically: `gemma4:12b` resolves.** Ollama's `/v2/library/<m>/tags/list` 404s for
  every Gemma family (false negative); the registry *manifest* endpoint is authoritative and returns 200 for
  `gemma4:12b` (7.38 GB model layer + vision projector — it is multimodal). No fallback needed.
- Ollama installed on yorha (needed `zstd` first). Models on the data volume: `OLLAMA_MODELS=/home/arash/ollama-models` (5.5 TB free).
- Real frozen `agent/gemma_adapter.generate()` returns real text:

```
$ ssh yorha 'cd /home/arash/bg && python3 -c "from agent.gemma_adapter import generate; ..."'
MODEL: gemma4:12b   URL: http://localhost:11434   LATENCY_MS: 3577 (warm)
GEMMA_ADVISORY: 'Pedestrian ahead to your left.'
```

- **#1 finding for Lane 2 — `gemma4:12b` is a reasoning model.** With thinking on it spends the token budget on
  hidden reasoning and returns **empty `content`** intermittently (`done_reason: length`, `eval_count: 256`,
  `content: ''`). Fix: send `"think": false` — then `done_reason: stop`, ~8 tokens, terse advisory directly.
  Applied to the seed adapter (one added key, signature unchanged). Lane 2: keep it, or handle empty content.
- Cold load of the 7.6 GB model exceeds the frozen adapter's 60 s timeout, so `run_demo.sh` and `check_offline.sh`
  **warm the model first** (a `think:false` ping) before any timed call.

## CP2 — one-command + offline (all verified by doing)

**Cache round-trip — no re-synthesis on a hit (quality bar #2):**
```
path1 == path2 : voice/cache/clip03-000148.wav   (84012 bytes, real Piper)
mtime1_ns == mtime2_ns : True   (Piper never re-ran)   2nd-call latency: 0.2 ms
```
Caught by transcribing the wav: the first render voiced the em-dash's UTF-8 bytes as mojibake ("Break a
circumflex Euro's..."). Fixed by forcing `PYTHONUTF8=1` on the Piper subprocess. The committed wav now
transcribes to "Brake, pedestrian, left." (whisper hears "Brake" as its homophone "Break").

**`transcribe()` offline (quality bar #4) — faster-whisper, HF_HUB_OFFLINE=1:**
```
spoken    : How many times was I blinded near a pedestrian tonight?
transcript: How many times was I blinded near a pedestrian tonight?
```

**`run_demo.sh` on yorha (quality bar #1):** brings Ollama up, warms `gemma4:12b`, confirms it answers locally.
Banner is honestly gated — `agent/` (Lane 2) and `app/` (Lane 3) are not in the repo yet, so it prints
`PARTIAL STACK` today; the exact `ALL LOCAL — SAFE TO UNPLUG` fires when both lanes land (branch verified).
`run_demo.ps1` parses clean and fails loud when Ollama is absent.

**`check_offline.sh` on yorha (quality bar #5):**
```
[2/4] Gemma (local): Pedestrian ahead. Brake immediately.
[3/4] wav: voice/cache/clip03-000148.wav (84012 bytes)   (no synthesis, no network)
[4/4] Ollama listens on 127.0.0.1:11434 only
OFFLINE CHECK (loopback proof) PASSED — local Gemma answered, cached wav resolved, Ollama bound to loopback.
```

## Infra reality (why the offline proof has two modes)
- **yorha is a container without `CAP_NET_ADMIN`** — `sudo iptables` returns "Permission denied (you must be root)",
  and there is no audio device. So on yorha `check_offline.sh` runs the privilege-free proof (local Gemma answers +
  cached wav resolves + Ollama socket is loopback-only). The **physical-unplug / egress-drop pass** (the vetted
  iptables recipe, session-safe with an ESTABLISHED-accept + trap-restore) runs on the **demo console** (a box with
  NET_ADMIN). The script auto-detects capability and never claims a network-down pass it did not produce.
- **Voice toolchain runs on Windows** (piper-tts + faster-whisper install as prebuilt wheels; ffmpeg present).
  The pre-rendered wavs are committed, so the demo plays them with no Piper and no network.

## Scripted spoken line
Lane 1's committed `contracts/fixtures/clip03.json` carries two records: `clip03-000148` (brake,
"Brake — pedestrian, left.") and `clip03-000140` (caution, "Caution — pedestrian, left."). Both are
pre-rendered. The canonical spoken lines are also held in `voice/voice_iface.py::SCRIPTED` keyed by
`incident_id`; the cache is keyed by `incident_id`, so a hit plays the canonical wav whatever Gemma generates
at runtime — determinism + dead-network safety. `python -m voice.voice_iface` re-renders SCRIPTED plus any
advisory a fixture carries.

## Blocked / next
- `agent/run.py` (Lane 2) and `app/` (Lane 3) are both in the repo now. Verified on a clean HEAD checkout on yorha:
  `run_demo.sh` restarts/warms Gemma and starts the agent; it prints `PARTIAL STACK` there only because yorha has no
  Node to serve the app. On a Node-capable demo box the full `ALL LOCAL — SAFE TO UNPLUG` fires once the agent stays
  up and the app answers — the banner is gated on real liveness (agent PID checked, app URL polled), never asserted.
- Lane 2's `agent/run.py` is a stdin loop; launched with no stdin it exits at EOF, so `run_demo` reports the agent as
  down (honest) rather than faking it. Keeping it alive for the demo is Lane 2's runtime call (feed stdin / run as a service).
- `agent/gemma_adapter.py` was seeded here (verbatim + `think:false`, which Lane 2 kept); Lane 2 owns it. Lane 1 owns the fixture.
- devola assets not needed for this lane (develop against the fixture).

## The one command a teammate runs
```
ollama pull gemma4:12b     # one-time, online
bash run_demo.sh           # or: powershell -File run_demo.ps1   (Windows)
bash voice/check_offline.sh   # rehearse the offline beat before filming
```
