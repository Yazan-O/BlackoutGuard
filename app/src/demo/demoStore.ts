import { create } from "zustand";
import type { Incident } from "../types";

// One clock. Particles, detection box, banner, and brake latch all derive from playheadMs —
// nothing else in the demo owns a timer (scrubbing must move the whole world coherently).
export interface DemoState {
  playheadMs: number;
  durMs: number;
  playing: boolean;
  act: "storm";
  networkUp: boolean;
  incidents: Incident[];
  clipT0Ms: number; // event-window start on the clip's t_video_s axis
  brakeLatchedId: string | null;

  setPlayhead: (ms: number) => void;
  setPlaying: (p: boolean) => void;
  loadTimeline: (incidents: Incident[], durMs: number, clipT0Ms: number) => void;
  setNetworkUp: (up: boolean) => void;
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

  setPlayhead: (ms) => {
    const s = get();
    const clamped = Math.max(0, Math.min(s.durMs, ms));
    // The brake burst is ~0.15s of records — latch it so it holds on screen once crossed.
    // Scrubbing back before the brake releases the latch (the world stays a pure function of t).
    const videoMs = s.clipT0Ms + clamped;
    let latched: string | null = null;
    for (const r of s.incidents) {
      if (r.severity === "brake" && r.t_video_s * 1000 <= videoMs) latched = r.incident_id;
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
      playing: true,
    }),
  setNetworkUp: (up) => set({ networkUp: up }),
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
