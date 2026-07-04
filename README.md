# BlackoutGuard

On-device road-safety agent for the RAISE Summit Gemma-Edge track. Event-camera perception and a local Gemma model reason about near-misses inside the vehicle — nothing leaves the device. When the normal RGB camera is blinded by darkness or glare, the event camera still sees: the app warns, and it keeps working with the network unplugged.

## Operator app

The in-vehicle view is a Vite + React + TypeScript app in `app/`. It renders incident records (`contracts/incident_schema.json`) as a split screen — RGB-blind on the left, event-camera detections on the right — with an advisory banner that escalates by severity, a blindness timer built around the 2.0s motif, an on-device/offline badge, and an operator console (question box + Override/Dismiss).

```
cd app
npm install
npm run dev
```

Open http://localhost:5173. The app replays the baked fixture at `contracts/fixtures/clip03.json` and makes no network calls — pull the network and it keeps rendering, the badge stays green. To point the operator console at a live agent, set `VITE_AGENT_URL` (optional); without it, questions and operator actions are logged on-device.

## Submission README

The full submission README — the tools-vs-built disclosure table and the "How we used Gemma (locally, offline)" section — is assembled by the video/repo lane.
