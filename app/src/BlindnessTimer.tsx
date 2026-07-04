import { useEffect, useRef, useState } from "react";

const PIN_S = 2.0;

// Eases the shown value toward the current frame's blindness_duration_s, so it counts up smoothly
// whether the records are sparse (2 frames) or dense (per-frame). Pins/pulses once past the 2.0s motif.
export function BlindnessTimer({ targetS }: { targetS: number }) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const targetRef = useRef(targetS);
  targetRef.current = targetS;

  useEffect(() => {
    const id = setInterval(() => {
      const diff = targetRef.current - shownRef.current;
      if (Math.abs(diff) < 0.02) {
        if (shownRef.current !== targetRef.current) {
          shownRef.current = targetRef.current;
          setShown(targetRef.current);
        }
        return;
      }
      shownRef.current += diff * 0.18;
      setShown(shownRef.current);
    }, 40);
    return () => clearInterval(id);
  }, []);

  const pinned = shown >= PIN_S;
  return (
    <div className={`blind-timer${pinned ? " pinned" : ""}`}>
      <span className="blind-label">RGB BLIND</span>
      <span className="blind-value">{shown.toFixed(1)}s</span>
      {pinned && <span className="blind-pin">2.0s threshold</span>}
    </div>
  );
}
