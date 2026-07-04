# Lane A — App (operator view)

Status: CP1 + CP2 done. The split-screen operator app renders the clip03 fixture; the offline beat and the operator console are verified by doing (not asserted).

## Built (`app/`, Vite + React + TypeScript)
- Split-screen: RGB-blind (left, darkens on `rgb_blind`) vs event-sees (right, detection overlay). Plain `<canvas>` compositing, dark theme, one accent — safety red `#ff2d2d`. No charting lib, no dashboard.
- Detection overlay: each `detections[].bbox` (event-frame px, 640×480) mapped to canvas px at scale 0.75; red box + `class_name confidence` label chip.
- Advisory banner: severity-escalating — info muted / caution amber `#f5a524` / brake red `#ff2d2d`, `advisory` text verbatim; neutral placeholder if `advisory` is null (never fabricated).
- Blindness timer: counts up to `blindness_duration_s`, pins + pulses red at the 2.0s motif. `setInterval` + `performance.now()` (not rAF — advances even in a throttled/background tab).
- OFFLINE badge: always green ("ON-DEVICE · OFFLINE"), reads real `navigator.onLine`, sub-text flips when the network drops, never turns red.
- Operator console: question box + Override + Dismiss; emits `operator_action` `{action, note:null, t_utc:null}`; posts to the agent when `VITE_AGENT_URL` is set, else logs on-device.
- Fixture loader: bundles `contracts/fixtures/*.json` at build (glob, eager) → zero runtime fetch. Optional agent HTTP behind `VITE_AGENT_URL` (default off).

## Verified by doing
`npm run build` → `tsc --noEmit && vite build` clean, 36 modules; fixture inlined (`grep clip03-000148 dist/assets/*.js` hits).
`npm run dev` → Vite v6.4.3 on http://localhost:5173.

Rendered clip03, checked via computed-style + canvas-pixel + a11y-tree inspection (the preview renderer runs headless, so screenshots/rAF are throttled — the on-camera visual is the human's):
- Advisory banner: "Brake — pedestrian, left." (the fixture's current text, read dynamically — not hardcoded), color rgb(255,45,45), 22px, class `banner brake`.
- Event canvas: red-pixel bounding box minX=224 minY=133 maxX=313 maxY=253 = the detection box at canvas (225, 148.5, 39×105) + its "pedestrian 0.83" label chip — the 0.75 scale mapping from the worked example.
- Blindness timer: value "2.1s", pinned, "2.0s threshold", color `#ff2d2d`.
- OFFLINE badge: border + dot rgb(34,197,94) (`#22c55e`).

Network (preview_network): every request is `http://localhost:5173/...` — zero non-localhost calls. Fixture served from a localhost `@fs` read in dev, inlined in the production build.

Offline beat (set `navigator.onLine=false` + dispatch `offline`, i.e. what a cable-pull does): badge stayed green (rgb(34,197,94)), "ON-DEVICE · OFFLINE", sub-text → "network unplugged · still running"; reverted on `online`. (A physical cable-pull on camera is the human's step; this is the strongest headless equivalent.)

Operator console:
- Ask "How many times blinded near a pedestrian tonight?" → log `Q: …` + `local agent not connected — question logged on-device`. No fabricated answer.
- Override → banner softened brake→caution, tag OVERRIDDEN, advisory text preserved (amber `#f5a524`), button disabled, log `override · clip03-000148 · logged on-device`.
- Dismiss → incident cleared, banner "No active incident", timer removed, Ask disabled, log `dismiss · clip03-000148 · logged on-device`.

## Notes / handoff
- Staged only my lane's files: `.gitignore`, `contracts/fixtures/clip03.json`, `app/`, `README.md`, `reports/app.md`. The internal strategy docs (CLAUDE.md, TEAM_BRIEFING, EVENT_KIT, PLAN, DATA) are left unstaged — whether they go into the public repo is the repo/video lane's call, not this lane's. `agent/` and `voice/` belong to other lanes; not touched.
- Agent routes are `POST {VITE_AGENT_URL}/ask` and `/action`, default off — agent lane, confirm/adjust these shapes; the demo path never calls them.
- Real clip renders drop into `app/public/clips/` and draw into the same 640×480 logical canvas space, so the overlay stays aligned. Until devola lands, the event canvas shows a labeled "clip asset pending" placeholder with the real detection box on top — no synthetic event frame.
- `README.md` is a stub; the full submission README (tools-vs-built + "How we used Gemma") is the video/repo lane's.

## Blocked
Nothing. Built entirely against the committed fixture — no Gemma, no devola dependency.

## Next
- When devola is up: copy the clip slice into `app/public/clips/` + add the ~5-line frame draw (the overlay mapping is already in place).
- When the agent endpoint is up: set `VITE_AGENT_URL`, confirm `/ask` + `/action` shapes, re-verify Q&A end-to-end.
