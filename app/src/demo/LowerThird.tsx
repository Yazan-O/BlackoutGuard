import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { Incident } from "../types";

export interface AdvisoryLine {
  text: string;
  live: boolean; // true only when the running agent produced this exact text
  model: string | null;
}

const PLACEHOLDER = "Awaiting advisory from local agent…";

export function LowerThird({ incident, line }: { incident: Incident | null; line: AdvisoryLine | null }) {
  const [shown, setShown] = useState("");
  const tween = useRef<gsap.core.Tween | null>(null);
  const lastKey = useRef("");

  const severity = incident?.severity;
  const alerting = severity === "caution" || severity === "brake";
  const text = alerting ? (line?.text ?? PLACEHOLDER) : "";

  // Key on the displayed line, not the per-frame incident id: the active record advances ~30x/s,
  // but the advisory only re-types when severity or the real text actually changes.
  useEffect(() => {
    const key = `${severity ?? ""}|${text}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    tween.current?.kill();
    if (!text) {
      setShown("");
      return;
    }
    const n = { v: 0 };
    tween.current = gsap.to(n, {
      v: text.length,
      duration: Math.min(1.1, 0.28 + text.length * 0.022),
      ease: "none",
      onUpdate: () => setShown(text.slice(0, Math.round(n.v))),
    });
  }, [severity, text]);

  if (!alerting) return null;
  return (
    <div className={`lower-third ${severity}`}>
      <span className="lt-tag">{severity === "brake" ? "BRAKE" : "CAUTION"}</span>
      <span className="lt-text">
        {shown}
        <span className="lt-caret" />
      </span>
      {line?.live && line.model && (
        <span className="lt-chip">{line.model} · generated on-device</span>
      )}
    </div>
  );
}
