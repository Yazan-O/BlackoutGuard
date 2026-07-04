# Agent HTTP contract (app ↔ situational agent)

Status: **implemented.** `agent/run.py` serves this on `127.0.0.1:8000` (also `--replay` for the stdin path);
the app (`app/src/agent.ts`) calls it only when `VITE_AGENT_URL` is set — the default demo runs off the
fixture with no agent. Shapes below match the server; keep the two in sync if either side changes.

Base URL: `VITE_AGENT_URL` (e.g. `http://localhost:8000`). Local only, loopback, no cloud, no keys.

**CORS (required):** the app is served from `localhost:5173` and the agent from another port, so browser
requests are cross-origin. The server must answer the `OPTIONS` preflight and send
`Access-Control-Allow-Origin` (the app origin or `*`), `Access-Control-Allow-Methods: POST, OPTIONS`,
`Access-Control-Allow-Headers: content-type`. Without these the browser blocks the call and the app
falls back to the baked advisory. (Loopback only — this is not a public CORS exposure.)

## POST /advisory  → `situational.Situation.ingest(...)`
Request body: one incident record, or `{ "records": [ ... ] }`, or a bare list of records.
Response: `{ "records": [ <record with `advisory` filled>, ... ] }` — the app reads `records[0].advisory`.
The app calls this only for `severity` in `{caution, brake}`. `ingest` caches by `incident_id` on `localhost`
(the server also pre-ingests fixtures on startup), so the call — and the offline replay — returns the cached line.
Ollama down + cache miss → `502` (never a fabricated advisory); the app then falls back / shows the placeholder.

## GET /health
Response: `{ "ok": true, "model": "<gemma tag>", "incidents": <n> }`. Liveness check; the app does not require it.

## POST /ask  → `situational.Situation.ask(question)`
Request body: `{ "question": "<string>", "incident_id": "<string>" }`
Response: `{ "answer": "<string>" }`

## POST /action  → `situational.Situation.override(incident_id, action, note)`
Request body: `{ "incident_id": "<string>", "operator_action": { "action": "override"|"dismiss"|"confirm", "note": null, "t_utc": null } }`
Response: `2xx` on success (body ignored). `dismiss` softens that class for later cautions (feedback loop).

## Failure behavior (app side)
Any non-2xx, unreachable endpoint, or unset `VITE_AGENT_URL` → the app falls back to the record's baked
advisory / logs the action on-device. It never fabricates an answer or an advisory.
