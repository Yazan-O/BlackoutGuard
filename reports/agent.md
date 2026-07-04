# Lane 2 — Situational Agent

Built during the event. Gemma 4 open weights + local Ollama are disclosed tools; the situational state,
fact derivation, advisory/Q&A prompts, override feedback, cache, and run loop are ours.

Files: `agent/situational.py`, `agent/run.py`, `agent/cache/`. `agent/gemma_adapter.py` was seeded by
Lane 4 with the `think:false` fix (see below) — kept as-is. Fixture: `contracts/fixtures/clip03.json`.

Model tag confirmed empirically on yorha: `gemma4:12b` (architecture `gemma4`, 11.9B, Q4_K_M, ctx 262144).
Ollama serves at `http://localhost:11434`. No fallback tag needed.

## CP1 — advisory live (network up)
`gemma4:12b`, warmed, fixture piped through `run.py` on yorha:
```
$ cat contracts/fixtures/clip03.json | python3 -m agent.run
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

## Fixture change (flag for app / voice lanes)
Restored `contracts/fixtures/clip03.json` from the single-record placeholder to the frozen 2-record
§FIXTURE (same tracked pedestrian, track 7, caution→brake) — the dedupe demo needs both frames. The
`advisory` fields are backfilled with the real Gemma output above (matches the committed wav); regenerate
by clearing `agent/cache/` and re-piping the fixture — the strings reproduce at temperature 0.2.
The prior single-record file is archived (not deleted).

## App consumer fix (I made the 1->2 record change, so I closed its blast radius)
The 2-record fixture demoted the on-camera brake: `app/src/App.tsx` picked `records[0]`, now the caution
(`000140`, t=4.67), not the brake (`000148`, t=4.93). Changed the selection to the most-urgent unhandled
incident (brake over caution, tie-break latest time) — `tsc --noEmit && vite build` clean, and the real
fixture now resolves to `clip03-000148 -> "Brake — pedestrian, left."` The fixture stays chronological.

## Blocked / next
- No git remote yet. Pushing to the public `Yazan-O/BlackoutGuard` is the human's step (outward-facing).
- Advisory backfill is one team decision: the committed fixture carries the real Gemma advisories (demo-
  coherent, matches the wav) rather than the §FIXTURE's `advisory:null`. Flip to null if the app reads
  advisories from the agent/cache instead.
- Live wiring: app posts `ASK`/`OVERRIDE` to the agent — expose `run.py` behind the `/ask` + `/action`
  routes Lane 3 expects when the endpoint lands.
