# BlackoutGuard — 60s demo edit list

Video (unlisted): _link added when the cut is uploaded_ · **Total: 58.0s** (< 60s, ~2s trim headroom)

Cold open is sound-first: the cached voice line speaks on a black screen before any pixels, then the event view cuts in revealing what the voice already knew. The `gemma4:12b · generated on-device` provenance line is an edit overlay on the live-Gemma answer (beat 6) — it is not an on-screen element the app renders. The OFFLINE badge is green and **stays green** on the unplug; only its subtext changes.

| # | Beat | Source clip | In → Out | Dur | On-screen / voiceover |
|---|------|-------------|----------|-----|-----------------------|
| 1 | Cold open — sound first | A_coldopen_black.mov + voice/cache/clip03-000148.wav | 00:00.0 → 00:05.0 | 5.0s | Black screen. The on-device voice speaks: **"Brake — pedestrian, left."** No narration — let it land before any image. |
| 2 | The reveal — it sees | B_splitscreen_reveal.mov | 00:00.0 → 00:11.0 | 11.0s | Split screen snaps in. **Left RGB: BLIND**, near-black, blindness timer counting (2.1s). **Right event view: SEES**, red box on the pedestrian, `pedestrian 0.83`. VO: "A normal camera saw nothing. The event camera saw the person — and boxed the real one." |
| 3 | Sensor, not software | B_splitscreen_reveal.mov | 00:11.0 → 00:16.0 | 5.0s | Hold split screen; dim the left panel to underline the blindness. VO: "You can't detect what the sensor never captured. Today's pedestrian braking shows no benefit on unlit roads at night — so we changed the sensor." |
| 4 | Gemma advises — on-device | C_advisory_online.mov | 00:00.0 → 00:08.0 | 8.0s | Cut to the operator console. Advisory banner reads **BRAKE · "Brake — pedestrian, left."**; the incident is `clip03-000148`. VO: "On the car's own compute, Gemma reads the scene and calls it." |
| 5 | The unplug | D_unplug.mov | 00:00.0 → 00:12.0 | 12.0s | Hand pulls the network cable, in frame. OFFLINE badge subtext flips to **"network unplugged · still running"** — badge stays green. A new incident still fires and warns. VO (over the pull, let it breathe): "Now — network, off." |
| 6 | Gemma answers offline | E_offline_qa.mov | 00:00.0 → 00:09.0 | 9.0s | Still offline. Operator types a question; local Gemma answers over the incident log in the console. Edit overlay, lower third: **`gemma4:12b · generated on-device`**. VO: "Still off. Ask it — it answers from tonight's log, on the device." |
| 7 | Override + close | E_offline_qa.mov + H_closecard.png | 00:09.0 → 00:17.0 | 8.0s | Operator hits **Override** on a call; banner softens to **OVERRIDDEN**; the log takes the correction. Cut to end card: **BlackoutGuard — it sees in the dark, it runs in the car, nothing leaves** · repo URL. VO: "And when it's wrong, you correct it. Zero cloud. Nothing leaves the vehicle." |

**Duration check:** 5.0 + 11.0 + 5.0 + 8.0 + 12.0 + 9.0 + 8.0 = **58.0s** ✓ (< 60s)

VO word count ≈ 80 words — under a 60-second read, leaving the cold-open voice line and the unplug pause to breathe. Read it against a stopwatch before the final export; if it runs past 58s, cut words, do not speed up.

## Capture dependencies (must be true before recording — CP2)

These are the reasons this cut is not yet shot; each is a hard blocker, not a nicety:

1. **Real pixels.** `SplitScreen` currently draws placeholder canvases ("clip asset pending"); the RGB and event frames must be the real clip renders before beats 2–3 are worth filming. The detection boxes are already real fixture data.
2. **Advisory banner shows the Gemma line.** On the documented `run_demo` path the app talks to `agent/serve.py` (no `/advisory`), and the fixture advisory is `null`, so the banner falls back to "Awaiting advisory from local agent…". Point the app at `agent/run.py` (which serves `/advisory`, cache returns instantly and offline) or add the route to `serve.py`, so beat 4 shows the real advisory.
3. **Provenance is honest.** The `gemma4:12b · generated on-device` overlay sits on beat 6, the live `/ask` answer — a genuine local Gemma call. Do not caption the spoken advisory (a pre-rendered canonical wav) as generated live on camera. Before recording, regenerate `agent/cache/*.txt` from a live Gemma run so the on-screen advisory is captured model output, not a pre-placed string.
4. **Clips captured.** Screen-record the running app at 1080p (`http://localhost:5173`, default `?clip=clip03`); film the physical cable-pull on the demo box in landscape 1080p. Save to `video/assets/` under the source-clip names above.
