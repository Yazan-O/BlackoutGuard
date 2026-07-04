import { useEffect } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { useDemoStore } from "../demoStore";

// The film's master clock. One GSAP timeline advances playheadMs in real time; every layer
// (particles, box, lower-third, heartbeat, brake latch) still derives from that one store clock.
// Beats live here: a cold-open hold, the storm reveal, the advisory fire, and an addPause() that
// freezes the film so the judge triggers the unplug — the resume waits on the real network drop.

const SILENCE_S = 1.0; // matches the spine's unplug silence; the film resumes as it ends
const REVEAL_S = 0.6; // cold-open holds on the opening frame this long, then the storm uncovers

export interface FilmControls {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  paused(): boolean;
}

let controls: FilmControls | null = null;
export function film(): FilmControls | null {
  return controls;
}

function firstBrakeMs(): number | null {
  const { incidents, clipT0Ms } = useDemoStore.getState();
  for (const r of incidents) if (r.severity === "brake") return r.t_video_s * 1000 - clipT0Ms;
  return null;
}

// Unplug beat: two seconds after the first brake advisory lands (so it is read before the cut),
// or 40% in when a clip has no brake. Tunable for filming with ?unplug=<ms>.
function unplugBeatMs(durMs: number): number {
  const p = new URLSearchParams(location.search).get("unplug");
  if (p !== null && Number.isFinite(Number(p))) return Math.max(0, Math.min(durMs, Number(p)));
  const brake = firstBrakeMs();
  const beat = brake !== null ? brake + 2000 : durMs * 0.4;
  return Math.max(0, Math.min(durMs - 100, beat));
}

export function useFilmTimeline(durMs: number, coldOpen: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (durMs <= 0) return;
    const store = useDemoStore.getState;
    const head = { ms: 0 };
    const unplugMs = unplugBeatMs(durMs);
    const brakeMs = firstBrakeMs();

    const tl = gsap.timeline();
    tl.to(head, {
      ms: durMs,
      duration: durMs / 1000,
      ease: "none",
      onUpdate: () => store().setPlayhead(head.ms),
      onComplete: () => store().setPlaying(false),
    });
    if (coldOpen.current) {
      tl.set(coldOpen.current, { autoAlpha: 1 }, 0);
      tl.to(coldOpen.current, { autoAlpha: 0, duration: 0.7, ease: "power2.out" }, REVEAL_S);
    }
    tl.addLabel("reveal", REVEAL_S);
    if (brakeMs !== null) tl.addLabel("advisory", brakeMs / 1000);
    tl.addLabel("unplug", unplugMs / 1000);
    tl.addPause(unplugMs / 1000, () => {
      store().setAwaitingUnplug(true);
      store().setPlaying(false);
    });

    let resume: gsap.core.Tween | null = null;
    controls = {
      play: () => {
        store().setAwaitingUnplug(false);
        tl.play();
        store().setPlaying(true);
      },
      pause: () => {
        tl.pause();
        store().setPlaying(false);
      },
      toggle: () => (tl.paused() ? controls!.play() : controls!.pause()),
      seek: (ms) => {
        const c = Math.max(0, Math.min(durMs, ms));
        head.ms = c;
        tl.time(c / 1000, true); // suppress events so scrubbing past the beat doesn't trip the pause
        store().setAwaitingUnplug(false);
        store().setPlayhead(c);
      },
      paused: () => tl.paused(),
    };

    // The judge pulls the cable while the film is held at the unplug beat: the spine owns the
    // 1.0s of silence, then the film resumes and the next incident fires with the net down.
    const unsub = useDemoStore.subscribe((s, prev) => {
      if (prev.networkUp && !s.networkUp && tl.paused()) {
        resume?.kill();
        resume = gsap.delayedCall(SILENCE_S, () => controls?.play());
      }
    });

    return () => {
      unsub();
      resume?.kill();
      tl.kill();
      controls = null;
    };
  }, [durMs, coldOpen]);
}
