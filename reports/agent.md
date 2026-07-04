# Lane 2 — Situational Agent

Built during the event. Gemma 4 open weights + local Ollama are disclosed tools; the situational state,
fact derivation, advisory/Q&A prompts, override feedback, cache, and run loop are ours.

Files: `agent/situational.py`, `agent/run.py`, `agent/cache/`. `agent/gemma_adapter.py` was seeded by
Lane 4 with the `think:false` fix (see below) — kept as-is. Fixture: `contracts/fixtures/clip03.json`.

Model tag confirmed empirically on yorha: `gemma4:12b` (architecture `gemma4`, 11.9B, Q4_K_M, ctx 262144).
Ollama serves at `http://localhost:11434`. No fallback tag needed.

## CP1 — advisory live (network up)
`gemma4:12b`, warmed, fixture piped through `run.py --replay` on yorha (`--replay` = the stdin path; the
default invocation now starts the HTTP server, see below):
```
$ cat contracts/fixtures/clip03.json | python3 -m agent.run --replay
{... "incident_id":"clip03-000140" ... "advisory": "Caution — pedestrian, left." ...}
{... "incident_id":"clip03-000148" ... "advisory": "Brake — pedestrian, left." ...}
```
Both are real Gemma output, ≤12 words, grounded only in `detections` (pedestrian, left). The `000148`
brake line reads like a brake warning and matches the frozen submission string byte-for-byte — the same
line Lane 4's committed wav (`voice/cache/clip03-000148.wav`) and the app banner use. This resolves
Lane 4's "advisory-text drift" flag: the agent's real output **is** "Brake — pedestrian, left."

Side is derived from `bbox`, not guessed: `000148` bbox x=300 on the 640-wide event frame is left of the
320 centreline → "left" (`agent/situational.py:_side`). The near-zone VRU box straddles centre (its
centre 326 sits a hair right of 320), so the contract fixes the side on the box's leading edge.

## CP2 — reasoning, override, offline (all verified by doing)

**ASK — deduplicates by `track_id` (not basic RAG):**
```
ASK: how many pedestrian near-misses while blind?
-> There is 1 pedestrian near-miss involving a single road user (track 7) identified in two
   flagged frames. Both detections occurred within an RGB-blind window.
```
One distinct pedestrian (track 7) across two flagged frames in one blind window — the digest carries
`track_id` + `rgb_blind` so the dedupe is possible.

**OVERRIDE — dismiss softens later similar cautions; brake never softens (safety floor):**
```
baseline caution, no override            -> Caution — pedestrian, right.
OVERRIDE clip03-000140 dismiss, then
  a fresh low-confidence pedestrian caution -> Note — pedestrian, right, approaching zone, low confidence.
  a fresh brake of the same class          -> Brake — pedestrian, left.   (full strength, not softened)
```
The dismiss downgrades a later low-confidence caution of the same class (Caution → Note, "low
confidence"); a `brake` of the same dismissed class at low confidence still speaks at full strength.
The correction is recorded in `Situation.corrections`.

**Offline — Gemma is loopback-only, cache replays dead-network-safe, uncached fails loud:**
```
PROOF A (all non-loopback egress blocked in-process at the socket layer):
  EXTERNAL connect blocked by guard -> ('8.8.8.8', 53)
  LIVE OFFLINE ADVISORY (fresh, uncached): Brake — pedestrian, left.
PROOF B1 (OLLAMA_URL=http://127.0.0.1:1, dead): cached 000140/000148 replay, no network.
PROOF B2 (dead endpoint + fresh uncached id): requests.exceptions.ConnectionError raised — no fabricated advisory.
```
yorha is a container without `CAP_NET_ADMIN` (`sudo iptables` denied, matches Lane 4), and dropping its
NIC would knock out other users, so the on-box proof is the socket-level egress block (stronger than a
cable-pull — it severs all external egress) plus the dead-endpoint cache replay. The physical-unplug pass
runs on the demo console (a box with NET_ADMIN), per Lane 4's `check_offline.sh`.

## Adapter deviation (already the team's contract)
`gemma4:12b` is a reasoning model — with thinking on it spends the token budget on hidden reasoning and
returns **empty `content`** (`done_reason=length`, even at num_predict=256). Lane 4 independently hit this
and seeded `agent/gemma_adapter.py` with `"think": false` (one added key, locked signature unchanged);
`think:false` returns the terse advisory directly (`done_reason=stop`, ~0.7 s). Kept as-is.

## Fixture (2 records, `advisory: null` — agent is the live source)
`contracts/fixtures/clip03.json` is the frozen 2-record §FIXTURE (same tracked pedestrian, track 7,
caution→brake — the dedupe demo needs both frames), `advisory: null` per the contract. The agent fills
the advisory live from Gemma; the **source of truth for advisory text is now `agent/cache/<id>.txt`**
(real Gemma output, committed): `clip03-000140.txt` = "Caution — pedestrian, left.", `clip03-000148.txt`
= "Brake — pedestrian, left." The prior single-record placeholder is archived (not deleted).

## HTTP server (`python agent/run.py` — the agent endpoint)
Default invocation starts an `http.server` on `127.0.0.1:8000` (loopback only, `AGENT_PORT` overrides) and
**stays up** — the old stdin loop hit EOF under `nohup` and exited, so run_demo's `kill -0` reported the
agent down. One persistent `Situation`; pre-ingests every `contracts/fixtures/*.json` at startup (cache
hits, instant, offline). Routes match `app/src/agent.ts` exactly. Verified by doing on yorha:
```
[agent] serving http://127.0.0.1:8000  model=gemma4:12b  incidents=2
GET  /health   -> {"ok": true, "model": "gemma4:12b", "incidents": 2}
OPTIONS /ask   -> 204 + Access-Control-Allow-Origin/-Methods/-Headers   (browser preflight for a JSON POST)
POST /advisory -> {"records":[... "advisory":"Caution — pedestrian, left." ..., ... "Brake — pedestrian, left." ...]}
POST /ask      -> {"answer":"There is 1 pedestrian near-miss ... single road user (track 7) ... RGB-blind window."}
POST /action   -> {"ok": true, "incident_id": "clip03-000140", "action": "dismiss"}
```
`/ask` = `{question, incident_id}` -> `{answer}`; `/action` = `{incident_id, operator_action}` -> 200;
`/advisory` = a record / array / `{records:[...]}` -> `{records:[filled]}`. CORS on every response, OPTIONS
preflight handled, Ollama-down returns `502 {error}` (never a fabricated advisory). `--replay` keeps the
stdin path. Single-threaded on purpose (one mutable `Situation` + a human clicking).

## App consumer fix (I made the 1->2 record change, so I closed its blast radius)
The 2-record fixture demoted the on-camera brake: `app/src/App.tsx` picked `records[0]`, now the caution
(`000140`, t=4.67), not the brake (`000148`, t=4.93). Changed the selection to the most-urgent unhandled
incident (brake over caution, tie-break latest time) — `tsc --noEmit && vite build` clean, and the real
fixture now resolves to `clip03-000148 -> "Brake — pedestrian, left."` The fixture stays chronological.

## Blocked / next (handoffs — I verified the server side; these are others' one-liners)
- **Climax toggle (Lane 4):** the app talks to the agent only when `VITE_AGENT_URL` is set. Add
  `VITE_AGENT_URL=http://localhost:8000` before `npm run dev` in `run_demo.sh`/`.ps1` (optionally swap the
  agent `kill -0` for `curl -sf http://localhost:8000/health`). Then `/ask` + `/action` (already wired in
  `agent.ts`) run the "operator asks, Gemma answers" climax end-to-end. I did not touch run_demo — it is
  under active concurrent edit.
- **Banner advisory (Team A):** with the fixture `advisory: null`, the banner shows the neutral placeholder
  until the app fetches `POST /advisory` (returns the filled record) when `VITE_AGENT_URL` is set. Shape above.
- **Voice prerender (Lane 4):** point the prerender at `agent/cache/<id>.txt`, not the fixture `advisory`
  field (now null). The committed wavs already match ("Brake — pedestrian, left.").
- **Offline live-gen (Lane 4):** true unplug needs Ollama on the demo box (`gemma4:e4b-it-qat` edge tier);
  the committed cache makes replay bulletproof on any box, but live generation offline is the demo-console's setup.
- No git remote yet. Pushing to public `Yazan-O/BlackoutGuard` is the human's step (outward-facing).
