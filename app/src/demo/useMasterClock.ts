import { useEffect } from "react";
import { useDemoStore } from "./demoStore";

// The one clock. rAF advances playheadMs by real elapsed time while playing; every layer
// (particles, box, banner, latch) derives from the store — no other timers anywhere.
export function useMasterClock() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useDemoStore.getState();
      if (s.playing && s.durMs > 0) s.setPlayhead(s.playheadMs + (now - last));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
