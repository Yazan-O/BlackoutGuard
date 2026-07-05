import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { loadClip } from "../fixtures";
import { EventAssetError, loadEventClip, type EventClip, type EventTier } from "../io/eventsLoader";
import { EventCloud } from "../three/EventCloud";
import { DetectionBox } from "../three/DetectionBox";
import type { Incident } from "../types";
import { activeIncident, latchedBrake, useDemoStore } from "./demoStore";
import { film, useFilmTimeline } from "./choreography/timeline";
import { OfflineBadge } from "../OfflineBadge";
import { agentConfigured, agentModel } from "../agent";
import { cachedAdvisory } from "../io/advisories";
import { soundSpine } from "../io/audio";
import { useSoundSpine, useSpineStatus } from "./useSoundSpine";
import { LowerThird, type AdvisoryLine } from "./LowerThird";
import { OperatorConsole } from "../ui/OperatorConsole";
import { KillSwitch } from "../ui/KillSwitch";

// 260ms decay leaves a short motion trail so the silhouette accumulates across frames and the eye
// tracks it (the doc's "condenses out of the noise as coherent motion"). Longer smears the figure.
const STORM_DECAY_MS = 260;

export function StormScene({ clipId }: { clipId: string }) {
  const [clip, setClip] = useState<EventClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadTimeline = useDemoStore((s) => s.loadTimeline);
  const durMs = useDemoStore((s) => s.durMs);
  const coldOpen = useRef<HTMLDivElement>(null);

  useFilmTimeline(durMs, coldOpen);
  useSoundSpine();

  // The sound spine's AudioContext can only start after a gesture (autoplay policy); arm it on the
  // first one anywhere. enable() is idempotent, so the sound toggle and Play button also trip it.
  useEffect(() => {
    const arm = () => soundSpine.enable();
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  useEffect(() => {
    let gone = false;
    setClip(null);
    setError(null);
    // ?tier=lite forces the committed downsampled buffer (for a weak GPU); default hero renders the
    // dense full-res tier, falling back to lite loudly if that buffer isn't present.
    const preferred: EventTier = new URLSearchParams(location.search).get("tier") === "lite" ? "lite" : "hero";
    loadEventClip(clipId, preferred)
      .then((c) => {
        if (gone) return;
        const records = loadClip(clipId);
        // fixtures' t_video_s and the binary's t_ms share the window-relative axis → offset 0
        loadTimeline(records, c.meta.dur_ms, 0);
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

  // ?t=<ms> jumps straight to a beat for rehearsal/filming; ?hold freezes there. Applied once the
  // timeline exists so the seek isn't overwritten by the next clock tick.
  useEffect(() => {
    if (durMs <= 0) return;
    const p = new URLSearchParams(location.search);
    if (!p.has("t")) return;
    const jump = Number(p.get("t"));
    const f = film();
    if (!f || !Number.isFinite(jump)) return;
    f.seek(jump);
    if (p.has("hold")) f.pause();
  }, [durMs]);

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
          <span className="brand-sub">night witness · {clipId}{clip ? ` · ${clip.tier}` : ""}</span>
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
          <EventCloud clip={clip} decayMs={STORM_DECAY_MS} />
          <DetectionBox frame={clip.meta.frame} />
        </Canvas>
      )}
      <div className="film-coldopen" ref={coldOpen} />
      {!clip && <div className="storm-loading">loading event stream…</div>}

      <FilmAdvisory />
      <UnplugCue />
      <KillSwitch />
      <OperatorConsole />
      <StormControls />
      <SoundToggle />
      <a className="storm-fallback" href="?simple">
        split-screen view
      </a>
    </div>
  );
}

function FilmAdvisory() {
  const subject = useDemoStore((s) => latchedBrake(s) ?? activeIncident(s));
  const line = useAdvisoryLine(subject);
  return <LowerThird incident={subject} line={line} />;
}

// The line the lower-third reads: real advisory text from the committed cache (offline), attributed
// to the model the live agent reports. No agent → no model → the chip stays hidden (never fabricated).
function useAdvisoryLine(incident: Incident | null): AdvisoryLine | null {
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => {
    if (!agentConfigured()) return;
    let cancelled = false;
    agentModel().then((m) => {
      if (!cancelled) setModel(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!incident) return null;
  if (incident.severity !== "caution" && incident.severity !== "brake") return null;
  const text = cachedAdvisory(incident.incident_id) ?? incident.advisory;
  if (!text) return null;
  return { text, live: model !== null, model };
}

function UnplugCue() {
  const awaiting = useDemoStore((s) => s.awaitingUnplug);
  const networkUp = useDemoStore((s) => s.networkUp);
  if (!awaiting) return null;
  return (
    <div className="film-cue">
      <span>{networkUp ? "pull the network — the vehicle keeps seeing" : "network down · resuming on local Gemma"}</span>
      <button className="film-cue-resume" onClick={() => film()?.play()}>
        resume
      </button>
    </div>
  );
}

function SoundToggle() {
  const { enabled, muted } = useSpineStatus();
  const label = !enabled ? "enable sound" : muted ? "sound off" : "sound on";
  return (
    <button
      className={`storm-sound ${enabled && !muted ? "on" : ""}`}
      onClick={() => (soundSpine.enabled ? soundSpine.setMuted(!soundSpine.muted) : soundSpine.enable())}
    >
      {label}
    </button>
  );
}

function StormControls() {
  const playheadMs = useDemoStore((s) => s.playheadMs);
  const durMs = useDemoStore((s) => s.durMs);
  const playing = useDemoStore((s) => s.playing);
  const ended = durMs > 0 && playheadMs >= durMs;

  return (
    <div className="controls storm-controls">
      <button
        className="ctrl-btn"
        onClick={() => {
          const f = film();
          if (!f) return;
          if (ended) {
            f.seek(0);
            f.play();
          } else f.toggle();
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
        onChange={(e) => film()?.seek(Number(e.target.value))}
      />
      <span className="ctrl-time">t={(playheadMs / 1000).toFixed(2)}s</span>
    </div>
  );
}
