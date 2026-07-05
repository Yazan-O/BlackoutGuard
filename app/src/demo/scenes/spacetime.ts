import type { Detection, Incident } from "../../types";

// Act III geometry, derived from real records only — no hand-keyed motion, no synthetic points.
// The event frame is centered at the origin (x∈[-fw/2,fw/2], y up); the window's time axis becomes
// depth z∈[0, BLOCK_DEPTH] via zOf(). BLOCK_DEPTH is the one visual constant here: deeper than the
// frame is tall so the ~15 s window reads as a tunnel of time rather than a flat slab.
export const BLOCK_DEPTH = 520;

// Part B monocular-depth priors, disclosed on screen as an assumption and never claimed as measured:
// a 1.7 m road-user height and a 554 px focal length (≈60° horizontal field of view over 640 px).
export const PED_HEIGHT_M = 1.7;
export const FOCAL_PX = 554;

// Part B is built in metres; this scales the metric reconstruction into the same unit range as the
// block so one camera rig and one set of OrbitControls limits serve both acts.
export const WITNESS_SCALE = 24;

const VRU_CLASSES: ReadonlySet<Detection["class_name"]> = new Set([
  "pedestrian",
  "rider",
  "bicycle",
  "motorcycle",
]);

export function zOf(tMs: number, durMs: number): number {
  const clamped = Math.max(0, Math.min(durMs, tMs));
  return (clamped / durMs) * BLOCK_DEPTH;
}

// (cx, cy) event-frame px + time → the same centered, y-up, time-as-depth space the cloud lives in,
// so a filament vertex and the event that produced it land at the same point in the block.
export function blockPoint(
  cx: number,
  cy: number,
  tS: number,
  frame: [number, number],
  durMs: number,
): [number, number, number] {
  const [fw, fh] = frame;
  return [cx - fw / 2, fh / 2 - cy, zOf(tS * 1000, durMs)];
}

export interface BlindRun {
  frameStart: number;
  frameEnd: number;
  tStartS: number;
  tEndS: number;
  durationS: number;
  isHero: boolean;
}

// Contiguous rgb_blind windows, split on any gap in frame_idx. Each is a real hole in the RGB
// camera's knowledge. The hero run is the one that contains the braked rider (heroIncident).
export function blindRuns(incidents: Incident[]): BlindRun[] {
  const sorted = [...incidents].sort((a, b) => a.frame_idx - b.frame_idx);
  const runs: BlindRun[] = [];
  let cur: BlindRun | null = null;
  for (const r of sorted) {
    if (r.rgb_blind) {
      if (cur && r.frame_idx === cur.frameEnd + 1) {
        cur.frameEnd = r.frame_idx;
        cur.tEndS = r.t_video_s;
      } else {
        if (cur) runs.push(cur);
        cur = {
          frameStart: r.frame_idx,
          frameEnd: r.frame_idx,
          tStartS: r.t_video_s,
          tEndS: r.t_video_s,
          durationS: 0,
          isHero: false,
        };
      }
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  for (const run of runs) run.durationS = run.tEndS - run.tStartS;

  const hero = heroIncident(incidents);
  if (hero) {
    for (const run of runs) {
      run.isHero = hero.frame_idx >= run.frameStart && hero.frame_idx <= run.frameEnd;
    }
  }
  return runs;
}

// The braked road user the beat is about: the onset of the brake episode deepest into a blindout
// (max blindness_duration_s). Onset, not the whole burst, matches the app's brake-latch convention
// and lands on the box the tracker was most sure of — for zc09a that is zc09a-000309, a rider at
// t=10.2 s, 1.98 s after the RGB went dark, confidence 0.74.
export function heroIncident(incidents: Incident[]): Incident | null {
  const sorted = [...incidents].sort((a, b) => a.frame_idx - b.frame_idx);
  let best: Incident | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.severity !== "brake") continue;
    if (i > 0 && sorted[i - 1].severity === "brake") continue; // hold to the episode onset
    if (!r.detections.some((d) => VRU_CLASSES.has(d.class_name))) continue;
    if (!best || r.blindness_duration_s > best.blindness_duration_s) best = r;
  }
  return best;
}

export interface FilamentPoint {
  tS: number;
  cx: number;
  cy: number;
  h: number;
  conf: number;
  blind: boolean;
}

export interface Filament {
  trackId: number;
  className: Detection["class_name"];
  isHero: boolean;
  points: FilamentPoint[];
}

function trackPoints(incidents: Incident[], trackId: number): FilamentPoint[] {
  const pts: FilamentPoint[] = [];
  for (const r of incidents) {
    for (const d of r.detections) {
      if (d.track_id !== trackId) continue;
      const [x, y, w, h] = d.bbox;
      pts.push({
        tS: r.t_video_s,
        cx: x + w / 2,
        cy: y + h / 2,
        h,
        conf: d.confidence,
        blind: r.rgb_blind,
      });
    }
  }
  pts.sort((a, b) => a.tS - b.tS);
  return pts;
}

// Track ids of the rider(s) the brake fired on, gathered from rider-class detections inside the
// hero blindout. Two same-class tracks (the tracker dropped and re-acquired the rider) — treated
// together as "the rider," disclosed as such; their centroids are never joined across the gap.
function heroTrackIds(incidents: Incident[], hero: BlindRun): Set<number> {
  const ids = new Set<number>();
  for (const r of incidents) {
    if (r.t_video_s < hero.tStartS || r.t_video_s > hero.tEndS) continue;
    for (const d of r.detections) {
      if (d.class_name === "rider" && d.track_id != null) ids.add(d.track_id);
    }
  }
  return ids;
}

// Vulnerable-road-user filaments threading the hero blindout: the braked rider plus every other VRU
// the RGB never saw during those seconds. Each polyline is one real track's own centroids — no
// cross-track stitching, no interpolated motion.
export function filaments(incidents: Incident[]): Filament[] {
  const hero = blindRuns(incidents).find((r) => r.isHero);
  if (!hero) return [];

  const heroIds = heroTrackIds(incidents, hero);
  const contextIds = new Map<number, Detection["class_name"]>();
  for (const r of incidents) {
    if (r.t_video_s < hero.tStartS || r.t_video_s > hero.tEndS) continue;
    for (const d of r.detections) {
      if (d.track_id == null || !VRU_CLASSES.has(d.class_name)) continue;
      if (!heroIds.has(d.track_id) && !contextIds.has(d.track_id)) {
        contextIds.set(d.track_id, d.class_name);
      }
    }
  }

  const out: Filament[] = [];
  for (const id of heroIds) {
    const points = trackPoints(incidents, id);
    if (points.length) out.push({ trackId: id, className: "rider", isHero: true, points });
  }
  for (const [id, className] of contextIds) {
    const points = trackPoints(incidents, id);
    if (points.length) out.push({ trackId: id, className, isHero: false, points });
  }
  return out;
}

export interface Pulse {
  kind: "caution" | "brake";
  tS: number;
  incidentId: string;
}

// The caution→brake escalation on the hero rider: the earliest caution frame that already carries
// one of the hero rider tracks, then the brake itself. Both are real incident timestamps.
export function heroPulses(incidents: Incident[]): Pulse[] {
  const hero = heroIncident(incidents);
  const run = blindRuns(incidents).find((r) => r.isHero);
  if (!hero || !run) return [];
  const heroIds = heroTrackIds(incidents, run);

  let caution: Incident | null = null;
  for (const r of incidents) {
    if (r.severity !== "caution") continue;
    if (!r.detections.some((d) => d.track_id != null && heroIds.has(d.track_id))) continue;
    if (!caution || r.t_video_s < caution.t_video_s) caution = r;
  }

  const pulses: Pulse[] = [];
  if (caution) pulses.push({ kind: "caution", tS: caution.t_video_s, incidentId: caution.incident_id });
  pulses.push({ kind: "brake", tS: hero.t_video_s, incidentId: hero.incident_id });
  return pulses;
}

export interface GhostSample {
  tS: number;
  X: number;
  Y: number;
  Z: number;
  blind: boolean;
}

// Monocular depth from geometry, disclosed and never measured: Z = f · H / bbox_height_px.
export function depthOf(bboxHeightPx: number): number {
  return (FOCAL_PX * PED_HEIGHT_M) / bboxHeightPx;
}

// The hero rider's ghost trajectory in metric camera space: camera at the origin looking down +Z,
// ground at Y=0. Lateral X from the pinhole model, depth Z from bbox height. Real bboxes only; the
// gap between the two rider tracks stays a gap in the samples, not a fabricated segment.
export function ghostTrack(incidents: Incident[], frame: [number, number]): GhostSample[] {
  const [fw] = frame;
  const pts: GhostSample[] = [];
  for (const f of filaments(incidents)) {
    if (!f.isHero) continue;
    for (const p of f.points) {
      const Z = depthOf(p.h);
      const X = ((p.cx - fw / 2) / FOCAL_PX) * Z;
      pts.push({ tS: p.tS, X, Y: 0, Z, blind: p.blind });
    }
  }
  pts.sort((a, b) => a.tS - b.tS);
  return pts;
}

// Is the review cursor (video seconds) inside any real blind run — i.e. is the RGB camera dark
// right now? Drives the RGB frustum's flicker in Part B; the event frustum ignores it.
export function isBlindAt(runs: BlindRun[], tS: number): boolean {
  return runs.some((r) => tS >= r.tStartS && tS <= r.tEndS);
}
