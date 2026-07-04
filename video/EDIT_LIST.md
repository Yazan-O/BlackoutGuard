# BlackoutGuard — 60s demo edit list

Video (unlisted): _link added when the cut is uploaded_ · **Total: 58.0s** (< 60s, ~2s trim headroom)

Cut against **`clip_zc09a`** — real recorded DSEC night footage (`app/public/clips/clip_zc09a.mp4` + `zc09a.events.bin`), 455 real incident records (275 info, 172 caution, 8 brake). Not the pre-event `clip03` fixture. The on-screen claim is "real recorded sensor data, nothing simulated," so every frame is the real sensor; the detection boxes are the detector's real output on that data.

Hero incident: **`zc09a-000309`** — a brake on a **rider** entering from the **left** while the RGB camera has been **blind for ~2.0s** (`rgb_blind: true`, `blindness_duration_s` 1.98, `rider 0.74`, near zone). This is the one moment in the clip where a brake, a real multi-second RGB blackout, and a vulnerable road user coincide — the "two seconds blind" thesis on real data.

Cold open is sound-first: the cached voice line speaks on a black screen before any pixels, then the event view cuts in revealing what the voice already knew. The `gemma4:12b · generated on-device` provenance line is an edit overlay on the live-Gemma answer (beat 6) — not an on-screen element the app renders. The OFFLINE badge is green and **stays green** on the unplug; only its subtext changes.

| # | Beat | Source clip | In → Out | Dur | On-screen / voiceover |
|---|------|-------------|----------|-----|-----------------------|
| 1 | Cold open — sound first | A_coldopen_black.mov + voice/cache/zc09a-000309.wav | 00:00.0 → 00:05.0 | 5.0s | Black screen. The on-device voice speaks: **"Brake — rider, left."** No narration — let it land before any image. |
| 2 | The reveal — it sees | B_splitscreen_reveal.mov (clip_zc09a @ t≈10.2s) | 00:00.0 → 00:11.0 | 11.0s | Split screen. **Left RGB: BLIND**, near-black, blindness timer at ~2.0s. **Right event view: SEES** — real DSEC frames, red box on the rider, `rider 0.74`, left. Caption right panel: **EVENT VIEW — real recorded sensor data**. VO: "A normal camera saw nothing for two seconds. The event camera saw the rider — and boxed the real one." |
| 3 | Sensor, not software | B_splitscreen_reveal.mov | 00:11.0 → 00:16.0 | 5.0s | Hold split screen; dim the left panel to underline the blindness. VO: "You can't detect what the sensor never captured. Today's pedestrian braking shows no benefit on unlit roads at night — so we changed the sensor." |
| 4 | Gemma advises — on-device | C_advisory_online.mov | 00:00.0 → 00:08.0 | 8.0s | Cut to the operator console. Advisory banner reads **BRAKE · "Brake — rider in near zone, left side."**; the incident is `zc09a-000309`. VO: "On the car's own compute, Gemma reads the scene and calls it." |
| 5 | The unplug | D_unplug.mov | 00:00.0 → 00:12.0 | 12.0s | Hand pulls the network cable, in frame. OFFLINE badge subtext flips to **"network unplugged · still running"** — badge stays green. A new incident still fires and warns. VO (over the pull, let it breathe): "Now — network, off." |
| 6 | Gemma answers offline | E_offline_qa.mov | 00:00.0 → 00:09.0 | 9.0s | Still offline. Operator types "how many times was I blinded near a pedestrian tonight?"; local Gemma answers over the 455-record incident log in the console. Edit overlay, lower third: **`gemma4:12b · generated on-device`**. VO: "Still off. Ask it — it answers from tonight's log, on the device." |
| 7 | Override + close | E_offline_qa.mov + H_closecard.png | 00:09.0 → 00:17.0 | 8.0s | Operator hits **Override** on a call; banner softens to **OVERRIDDEN**; the log takes the correction. Cut to end card: **BlackoutGuard — it sees in the dark, it runs in the car, nothing leaves** · repo URL. VO: "And when it's wrong, you correct it. Zero cloud. Nothing leaves the vehicle." |

**Duration check:** 5.0 + 11.0 + 5.0 + 8.0 + 12.0 + 9.0 + 8.0 = **58.0s** ✓ (< 60s)

VO word count ≈ 85 words — under a 60-second read, leaving the cold-open voice line and the unplug pause to breathe. Read it against a stopwatch before the final export; if it runs past 58s, cut words, do not speed up.

## Capture dependencies (must be true before recording — CP2)

Each is a hard blocker, not a nicety:

1. **App defaults to `clip_zc09a`.** `App.tsx` still defaults to `clip03`; Team A's default swap to `clip_zc09a` must land so the app renders the real DSEC clip (real pixels via `clip_zc09a.mp4` + `zc09a.events.bin`), not the placeholder canvases.
2. **Agent preloads `clip_zc09a` (Team C's preload fix).** The agent must ingest the 455-record `contracts/fixtures/clip_zc09a.json` so `/ask` reasons over the real log (beat 6) and the advisory for `zc09a-000309` is served/cached (beat 4). Its 180 caution/brake advisories are already cached in `agent/cache/zc09a-*.txt`.
3. **Cold-open voice wav for zc09a.** There is **no** `voice/cache/zc09a-*.wav` yet. Pre-render the hero line: add the canonical spoken line for `zc09a-000309` to `voice/voice_iface.py::SCRIPTED` and run `python -m voice.voice_iface` so `voice/cache/zc09a-000309.wav` exists. Keep the spoken line consistent with the detection (rider, left, brake); the banner shows the agent's fuller cached advisory.
4. **Advisory banner shows the Gemma line.** On the `serve.py` path there is no `/advisory` route and the fixture advisory is `null`, so the banner falls back to "Awaiting advisory from local agent…". Point the app at `agent/run.py` (which serves `/advisory`, cache returns instantly and offline) or add the route to `serve.py`, so beat 4 shows the real advisory.
5. **On-screen advisory is captured Gemma output.** The `agent/cache/zc09a-*.txt` lines were generated by the agent's advisory prompt; before filming, confirm they are a live Gemma run's output (regenerate if unsure), so the banner text is model output. The `gemma4:12b · generated on-device` overlay sits on beat 6, the live `/ask` answer — do not caption the pre-rendered voice line as generated live.
6. **Clips captured.** Screen-record the running app at 1080p (default clip `clip_zc09a`); film the physical cable-pull on the demo box in landscape 1080p. Save to `video/assets/` under the source-clip names above.
