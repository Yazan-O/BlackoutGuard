import { create } from "zustand";
import type { Incident, OperatorAction } from "../types";

// One clock. Particles, detection box, banner, and brake latch all derive from playheadMs —
// nothing else in the demo owns a timer (scrubbing must move the whole world coherently).
export interface DemoState {
  playheadMs: number;
  durMs: number;
  playing: boolean;
  act: "storm" | "monolith" | "witness";
  networkUp: boolean;
  incidents: Incident[];
  clipT0Ms: number; // event-window start on the clip's t_video_s axis
  brakeLatchedId: string | null;
  awaitingUnplug: boolean; // film is held at the pre-unplug beat, waiting for the judge to pull the cable

  // Act III (monolith/witness). spacetime lifts the flat storm into the time-as-depth block;
  // reviewCursorMs is Act III's own review head so orbiting/scrubbing the block never disturbs the
  // film clock (playheadMs). isolatedTrackId dims everything but one clicked track.
  spacetime: number;
  reviewCursorMs: number;
  isolatedTrackId: number | null;

  // Act IV operator console: the running Q&A transcript (typed + voice), each entry stamped with the
  // film clock (ms) so it stays a pure function of the one clock. Appended by the console and the voice loop.
  qaTranscript: { q: string; a: string; ms: number }[];

  // Act IV override audit: the operator's action per incident (dismiss/override/confirm), keyed by
  // incident_id. Drives the console's downgrade beat and (later) the NIGHT LOG override notches.
  overrides: Record<string, OperatorAction>;

  setPlayhead: (ms: number) => void;
  setPlaying: (p: boolean) => void;
  loadTimeline: (incidents: Incident[], durMs: number, clipT0Ms: number) => void;
  setNetworkUp: (up: boolean) => void;
  setAwaitingUnplug: (v: boolean) => void;
  setAct: (a: DemoState["act"]) => void;
  setSpacetime: (v: number) => void;
  setReviewCursor: (ms: number) => void;
  setIsolatedTrack: (id: number | null) => void;
  addQA: (q: string, a: string) => void;
  setOverride: (incidentId: string, action: OperatorAction) => void;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  playheadMs: 0,
  durMs: 0,
  playing: true,
  act: "storm",
  networkUp: navigator.onLine,
  incidents: [],
  clipT0Ms: 0,
  brakeLatchedId: null,
  awaitingUnplug: false,
  spacetime: 0,
  reviewCursorMs: 0,
  isolatedTrackId: null,
  qaTranscript: [],
  overrides: {},

  setPlayhead: (ms) => {
    const s = get();
    const clamped = Math.max(0, Math.min(s.durMs, ms));
    // The brake burst is ~0.15s of records — latch the onset of the most-recent brake episode so it
    // holds on screen once crossed as one advisory / one spoken wav, not one per 0.03s frame.
    // Scrubbing back before the brake releases the latch (the world stays a pure function of t).
    const videoMs = s.clipT0Ms + clamped;
    let latched: string | null = null;
    const inc = s.incidents;
    for (let i = 0; i < inc.length; i++) {
      if (inc[i].t_video_s * 1000 > videoMs) break;
      if (inc[i].severity === "brake" && (i === 0 || inc[i - 1].severity !== "brake")) {
        latched = inc[i].incident_id;
      }
    }
    set({ playheadMs: clamped, brakeLatchedId: latched, playing: s.playing && clamped < s.durMs });
  },
  setPlaying: (p) => set({ playing: p }),
  loadTimeline: (incidents, durMs, clipT0Ms) =>
    set({
      incidents: [...incidents].sort((a, b) => a.t_video_s - b.t_video_s),
      durMs,
      clipT0Ms,
      playheadMs: 0,
      brakeLatchedId: null,
      awaitingUnplug: false,
      playing: true,
    }),
  setNetworkUp: (up) => set({ networkUp: up }),
  setAwaitingUnplug: (v) => set({ awaitingUnplug: v }),
  setAct: (a) => set({ act: a }),
  setSpacetime: (v) => set({ spacetime: Math.max(0, Math.min(1, v)) }),
  setReviewCursor: (ms) => set({ reviewCursorMs: Math.max(0, Math.min(get().durMs, ms)) }),
  setIsolatedTrack: (id) => set({ isolatedTrackId: id }),
  addQA: (q, a) => set((s) => ({ qaTranscript: [...s.qaTranscript, { q, a, ms: s.playheadMs }] })),
  setOverride: (incidentId, action) =>
    set((s) => ({ overrides: { ...s.overrides, [incidentId]: action } })),
}));

export function activeIncident(s: DemoState): Incident | null {
  const videoMs = s.clipT0Ms + s.playheadMs;
  let active: Incident | null = null;
  for (const r of s.incidents) {
    if (r.t_video_s * 1000 <= videoMs) active = r;
    else break;
  }
  return active;
}

export function latchedBrake(s: DemoState): Incident | null {
  if (!s.brakeLatchedId) return null;
  return s.incidents.find((r) => r.incident_id === s.brakeLatchedId) ?? null;
}
