import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident } from "./types";

const LEAD_S = 1.0; // clear-road lead-in before the first detection
const TAIL_S = 1.5; // hold on the last frame (the brake) after it passes

export interface Playback {
  t: number;
  t0: number;
  t1: number;
  playing: boolean;
  ended: boolean;
  frame: Incident | null;
  toggle: () => void;
  replay: () => void;
  seek: (t: number) => void;
}

// Drives a real-time clock over the clip's t_video_s range so the active detection frame advances
// with time and the box follows. Plays once, then holds on the last frame. Uses setInterval + real
// elapsed time (not requestAnimationFrame, which pauses in a backgrounded tab).
export function usePlayback(records: Incident[]): Playback {
  const sorted = useMemo(() => [...records].sort((a, b) => a.t_video_s - b.t_video_s), [records]);

  const [t0, t1] = useMemo(() => {
    if (sorted.length === 0) return [0, 0];
    return [Math.max(0, sorted[0].t_video_s - LEAD_S), sorted[sorted.length - 1].t_video_s + TAIL_S];
  }, [sorted]);

  const [t, setTState] = useState(t0);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(t0);
  const setT = (v: number) => {
    tRef.current = v;
    setTState(v);
  };

  useEffect(() => {
    setT(t0);
    setPlaying(true);
  }, [t0, t1]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const next = tRef.current + (now - last) / 1000;
      last = now;
      if (next >= t1) {
        setT(t1);
        setPlaying(false);
      } else {
        setT(next);
      }
    }, 33);
    return () => clearInterval(id);
  }, [playing, t1]);

  const frame = useMemo(() => {
    let active: Incident | null = null;
    for (const r of sorted) {
      if (r.t_video_s <= t) active = r;
      else break;
    }
    return active;
  }, [sorted, t]);

  const seek = (x: number) => setT(Math.max(t0, Math.min(t1, x)));
  const replay = () => {
    setT(t0);
    setPlaying(true);
  };
  const toggle = () => {
    if (tRef.current >= t1) replay();
    else setPlaying((p) => !p);
  };

  return { t, t0, t1, playing, ended: t >= t1, frame, toggle, replay, seek };
}
