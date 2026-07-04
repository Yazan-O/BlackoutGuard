import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { loadClip } from "../fixtures";
import { EventAssetError, loadEventClip, type EventClip } from "../io/eventsLoader";
import { EventCloud } from "../three/EventCloud";
import { DetectionBox } from "../three/DetectionBox";
import { activeIncident, latchedBrake, useDemoStore } from "./demoStore";
import { useMasterClock } from "./useMasterClock";
import { OfflineBadge } from "../OfflineBadge";

export function StormScene({ clipId }: { clipId: string }) {
  const [clip, setClip] = useState<EventClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadTimeline = useDemoStore((s) => s.loadTimeline);

  useMasterClock();

  useEffect(() => {
    let gone = false;
    setClip(null);
    setError(null);
    loadEventClip(clipId)
      .then((c) => {
        if (gone) return;
        const records = loadClip(clipId);
        // fixtures' t_video_s and the binary's t_ms share the window-relative axis → offset 0
        loadTimeline(records, c.meta.dur_ms, 0);
        // ?t=<ms> jumps straight to a beat (rehearsal/filming); ?hold freezes there
        const p = new URLSearchParams(location.search);
        const jump = Number(p.get("t"));
        if (Number.isFinite(jump) && p.has("t")) {
          const st = useDemoStore.getState();
          st.setPlayhead(jump);
          if (p.has("hold")) st.setPlaying(false);
        }
        setClip(c);
      })
      .catch((e) => {
        if (gone) return;
        setError(e instanceof EventAssetError ? e.message : String(e));
      });
    return () => {
      gone = true;
    };
  }, [clipId, loadTimeline]);

  if (error) {
    return (
      <div className="storm storm-error">
        <div className="storm-error-box">
          <span className="banner-tag">EVENT DATA MISSING</span>
          <p>{error}</p>
          <p>
            Bake it with perception/bake_events.py and place it under app/public/clips/. This scene
            renders real sensor events only — there is no synthetic fallback.
          </p>
          <a href="?simple">open the split-screen fallback</a>
        </div>
      </div>
    );
  }

  return (
    <div className="storm">
      <header className="storm-top">
        <div className="brand">
          <span className="brand-name">BlackoutGuard</span>
          <span className="brand-sub">night witness · {clipId}</span>
        </div>
        <OfflineBadge />
      </header>

      {clip && (
        <Canvas
          className="storm-canvas"
          orthographic
          camera={{ position: [0, 0, 100], zoom: 1.4, near: 0.1, far: 1000 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#020204"]} />
          <EventCloud clip={clip} />
          <DetectionBox frame={clip.meta.frame} />
        </Canvas>
      )}
      {!clip && <div className="storm-loading">loading event stream…</div>}

      <StormAdvisory />
      <StormControls />
      <a className="storm-fallback" href="?simple">
        split-screen view
      </a>
    </div>
  );
}

function StormAdvisory() {
  const inc = useDemoStore((s) => latchedBrake(s) ?? activeIncident(s));
  if (!inc || (inc.severity !== "brake" && inc.severity !== "caution")) return null;
  return (
    <div className={`banner storm-banner ${inc.severity}`}>
      <span className="banner-tag">{inc.severity === "brake" ? "BRAKE" : "CAUTION"}</span>
      <span className="banner-text">{inc.advisory ?? "Awaiting advisory from local agent…"}</span>
    </div>
  );
}

function StormControls() {
  const playheadMs = useDemoStore((s) => s.playheadMs);
  const durMs = useDemoStore((s) => s.durMs);
  const playing = useDemoStore((s) => s.playing);
  const setPlayhead = useDemoStore((s) => s.setPlayhead);
  const setPlaying = useDemoStore((s) => s.setPlaying);
  const ended = durMs > 0 && playheadMs >= durMs;

  return (
    <div className="controls storm-controls">
      <button
        className="ctrl-btn"
        onClick={() => {
          if (ended) setPlayhead(0);
          setPlaying(ended ? true : !playing);
        }}
      >
        {ended ? "Replay" : playing ? "Pause" : "Play"}
      </button>
      <input
        className="ctrl-scrub"
        type="range"
        min={0}
        max={durMs || 1}
        step={16}
        value={playheadMs}
        onChange={(e) => setPlayhead(Number(e.target.value))}
      />
      <span className="ctrl-time">t={(playheadMs / 1000).toFixed(2)}s</span>
    </div>
  );
}
