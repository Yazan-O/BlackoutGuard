import { useEffect, useState } from "react";

const PIN_S = 2.0;

export function BlindnessTimer({ durationS, incidentId }: { durationS: number; incidentId: string }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    setT(0);
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= durationS) {
        setT(durationS);
        clearInterval(id);
      } else {
        setT(elapsed);
      }
    }, 50);
    return () => clearInterval(id);
  }, [durationS, incidentId]);

  const pinned = t >= PIN_S;
  return (
    <div className={`blind-timer${pinned ? " pinned" : ""}`}>
      <span className="blind-label">RGB BLIND</span>
      <span className="blind-value">{t.toFixed(1)}s</span>
      {pinned && <span className="blind-pin">2.0s threshold</span>}
    </div>
  );
}
