import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type * as THREE from "three";
import { loadClip } from "../../fixtures";
import { EventAssetError, loadEventClip, type EventClip } from "../../io/eventsLoader";
import type { Incident } from "../../types";
import { OfflineBadge } from "../../OfflineBadge";
import { SpacetimeCloud } from "../../three/SpacetimeCloud";
import { VoidSlab } from "../../three/VoidSlab";
import { TrackFilament } from "../../three/TrackFilament";
import { useDemoStore } from "../demoStore";
import { runMonolithIntro, tweenView, type MonolithView } from "../choreography/timeline";
import { WitnessScene } from "./WitnessScene";
import {
  blindRuns,
  filaments,
  heroIncident,
  heroPulses,
  isBlindAt,
  zOf,
  type BlindRun,
} from "./spacetime";

const START_VIEW: MonolithView = { camPos: [0, 30, 900], target: [0, 0, 20] };
// a wide 3/4 that reads time-as-depth: the whole block, the hero void as a dark slab across it, the
// rider braid piercing that slab. Judges zoom the braid via isolate + scrub; this is the establishing frame.
const POSTER_VIEW: MonolithView = { camPos: [-760, 300, 800], target: [-10, -10, 300] };
// the reconstruction, framed from behind the sensors looking down the road at the frustums + ghost
const WITNESS_VIEW: MonolithView = { camPos: [-360, 300, -260], target: [0, 26, 200] };

export function MonolithScene({ clipId }: { clipId: string }) {
  const [clip, setClip] = useState<EventClip | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?still opens on the settled block poster; ?witness opens straight into the reconstruction — both
  // skip the storm→block lift, for filming and stills
  const params = new URLSearchParams(location.search);
  const still = params.has("still");
  const witnessStart = params.has("witness");

  useEffect(() => {
    let gone = false;
    setClip(null);
    setIncidents(null);
    setError(null);
    // the block shows every event at once, so the ~420k lite tier is the right one — the WebGPU
    // millions tier would blow out an all-visible additive cloud on the WebGL2 path.
    loadEventClip(clipId, "lite")
      .then((c) => {
        if (gone) return;
        const records = loadClip(clipId);
        if (!records.length) throw new Error(`no incident records in contracts/fixtures/${clipId}.json`);
        const st = useDemoStore.getState();
        st.loadTimeline(records, c.meta.dur_ms, 0);
        st.setAct(witnessStart ? "witness" : "monolith");
        st.setSpacetime(still || witnessStart ? 1 : 0);
        const hero = heroIncident(records);
        st.setReviewCursor(hero ? hero.t_video_s * 1000 : c.meta.dur_ms / 2);
        st.setIsolatedTrack(null);
        setClip(c);
        setIncidents(records);
      })
      .catch((e) => {
        if (!gone) setError(e instanceof EventAssetError ? e.message : String(e));
      });
    return () => {
      gone = true;
      useDemoStore.getState().setAct("storm");
    };
  }, [clipId, still, witnessStart]);

  const runs = useMemo(() => (incidents ? blindRuns(incidents) : []), [incidents]);
  const fils = useMemo(() => (incidents ? filaments(incidents) : []), [incidents]);
  const pulses = useMemo(() => (incidents ? heroPulses(incidents) : []), [incidents]);
  const hero = useMemo(() => (incidents ? heroIncident(incidents) : null), [incidents]);

  // Fail loud, never fake: the block is real events, real blind windows, a real braked rider. If any
  // of those is absent the beat has no honest content — show it and stop rather than invent geometry.
  const dataError =
    incidents && (!runs.some((r) => r.isHero) || !hero || fils.every((f) => !f.isHero))
      ? "the clip has no braked vulnerable-road-user inside a measured RGB-blind window"
      : null;

  if (error || dataError) return <Act3Missing message={error ?? dataError!} clipId={clipId} />;

  return (
    <div className="monolith">
      <header className="storm-top">
        <div className="brand">
          <span className="brand-name">BlackoutGuard</span>
          <span className="brand-sub">night witness · act III · {clipId}</span>
        </div>
        <OfflineBadge />
      </header>

      {clip && incidents && hero ? (
        <MonolithStage
          clip={clip}
          runs={runs}
          fils={fils}
          pulses={pulses}
          hero={hero}
          incidents={incidents}
          still={still}
        />
      ) : (
        <div className="storm-loading">lifting the event stream into spacetime…</div>
      )}
    </div>
  );
}

function MonolithStage({
  clip,
  runs,
  fils,
  pulses,
  hero,
  incidents,
  still,
}: {
  clip: EventClip;
  runs: BlindRun[];
  fils: ReturnType<typeof filaments>;
  pulses: ReturnType<typeof heroPulses>;
  hero: Incident;
  incidents: Incident[];
  still: boolean;
}) {
  const frame = clip.meta.frame;
  const durMs = clip.meta.dur_ms;
  const [selectedRun, setSelectedRun] = useState<BlindRun | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const act = useDemoStore((s) => s.act);
  const setAct = useDemoStore((s) => s.setAct);
  const isolatedTrackId = useDemoStore((s) => s.isolatedTrackId);
  const setIsolatedTrack = useDemoStore((s) => s.setIsolatedTrack);
  const inWitness = act === "witness";
  // the Canvas camera is created once — seed it with the view for the entry mode so a single render
  // (the ?still / ?witness stills, before any animation) is already framed correctly
  const initialView = useRef(still ? POSTER_VIEW : act === "witness" ? WITNESS_VIEW : START_VIEW).current;

  const heroFil = fils.find((f) => f.isHero && f.points.length >= 2) ?? fils.find((f) => f.isHero);
  const isolatedFil = fils.find((f) => f.trackId === isolatedTrackId);

  return (
    <>
      <Canvas
        className="storm-canvas"
        camera={{ position: initialView.camPos, near: 1, far: 8000, fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => {
          setIsolatedTrack(null);
          setSelectedRun(null);
        }}
      >
        <color attach="background" args={["#020204"]} />
        <MonolithWorld
          clip={clip}
          runs={runs}
          fils={fils}
          pulses={pulses}
          hero={hero}
          frame={frame}
          durMs={durMs}
          resetSignal={resetSignal}
          still={still}
          incidents={incidents}
          initialTarget={initialView.target}
          onVoidClick={setSelectedRun}
        />
      </Canvas>

      <div className="monolith-kicker">
        <span className="mono-tag">{inWitness ? "ACT III · THE WITNESS RECONSTRUCTION" : "ACT III · THE SPACETIME BLOCK"}</span>
        <span className="mono-sub">
          {inWitness
            ? "position derived from detection geometry — pedestrian-height prior, fixed focal length"
            : `x, y, and ${(durMs / 1000).toFixed(0)} s of time as depth — every point a real sensor event`}
        </span>
      </div>

      <ReviewReadout runs={runs} incidents={incidents} durMs={durMs} />

      <div className="monolith-hints">
        {inWitness ? "drag to orbit · scrub time to walk the ghost" : "drag to orbit · scrub time · click the braid · click a void"}
      </div>

      <button
        className={`monolith-witness-toggle ${inWitness ? "on" : ""}`}
        onClick={() => {
          setIsolatedTrack(null);
          setSelectedRun(null);
          setAct(inWitness ? "monolith" : "witness");
        }}
      >
        {inWitness ? "◂ the block" : "witness reconstruction ▸"}
      </button>

      <button className="monolith-reset" onClick={() => setResetSignal((n) => n + 1)}>
        reset view
      </button>

      <div className="monolith-prov">
        {clip.meta.count.toLocaleString()} real events · {runs.length} measured rgb-blind windows · localhost only
      </div>

      {!inWitness && isolatedFil && (
        <div className="monolith-panel monolith-isolate">
          <span className="mono-tag red">TRACK {isolatedFil.trackId}</span>
          <div>
            <strong>{isolatedFil.className}</strong> · {isolatedFil.points.length} real detections ·{" "}
            {isolatedFil.isHero ? "the rider the system braked for" : "vulnerable road user in the blindout"}
          </div>
          <button onClick={() => setIsolatedTrack(null)}>clear</button>
        </div>
      )}

      {!inWitness && selectedRun && (
        <div className="monolith-panel monolith-void">
          <span className="mono-tag">RGB BLIND</span>
          <div>
            this blindout <strong>{selectedRun.durationS.toFixed(1)} s</strong> · frames{" "}
            {selectedRun.frameStart}–{selectedRun.frameEnd}
            {selectedRun.isHero && (
              <>
                {" "}
                · braked <strong>{hero.blindness_duration_s.toFixed(1)} s</strong> in ({hero.incident_id})
              </>
            )}
          </div>
          <button onClick={() => setSelectedRun(null)}>close</button>
        </div>
      )}

      {!inWitness && heroFil && (
        <button
          className={`monolith-hero-cue ${isolatedTrackId === heroFil.trackId ? "on" : ""}`}
          onClick={() =>
            setIsolatedTrack(isolatedTrackId === heroFil.trackId ? null : heroFil.trackId)
          }
        >
          {isolatedTrackId === heroFil.trackId ? "show all tracks" : "isolate the rider"}
        </button>
      )}
    </>
  );
}

function MonolithWorld({
  clip,
  runs,
  fils,
  pulses,
  hero,
  frame,
  durMs,
  resetSignal,
  still,
  incidents,
  initialTarget,
  onVoidClick,
}: {
  clip: EventClip;
  runs: BlindRun[];
  fils: ReturnType<typeof filaments>;
  pulses: ReturnType<typeof heroPulses>;
  hero: Incident;
  frame: [number, number];
  durMs: number;
  resetSignal: number;
  still: boolean;
  incidents: Incident[];
  initialTarget: [number, number, number];
  onVoidClick: (run: BlindRun) => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const act = useDemoStore((s) => s.act);
  const isolatedTrackId = useDemoStore((s) => s.isolatedTrackId);
  const setIsolatedTrack = useDemoStore((s) => s.setIsolatedTrack);
  const setSpacetime = useDemoStore((s) => s.setSpacetime);
  const mounted = useRef(false);
  const inWitness = act === "witness";

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const cam = camera as THREE.PerspectiveCamera;
    const view = act === "witness" ? WITNESS_VIEW : POSTER_VIEW;

    if (!mounted.current) {
      mounted.current = true;
      // ?still / ?witness open on the settled frame; otherwise the first mount runs the storm→block lift
      if (still || act === "witness") {
        cam.position.set(...view.camPos);
        orbit.target.set(...view.target);
        orbit.update();
        setSpacetime(1);
        return;
      }
      return runMonolithIntro(cam, orbit, START_VIEW, POSTER_VIEW, setSpacetime, 3.4);
    }
    // an act toggle or a reset eases the camera to the view for the current act
    return tweenView(cam, orbit, view, 1.4);
  }, [camera, act, resetSignal, still, setSpacetime]);

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={initialTarget}
        minDistance={120}
        maxDistance={3600}
      />
      {!inWitness && <SpacetimeCloud clip={clip} />}
      {!inWitness &&
        runs.map((run, i) => (
          <VoidSlab
            key={i}
            frame={frame}
            zStart={zOf(run.tStartS * 1000, durMs)}
            zEnd={zOf(run.tEndS * 1000, durMs)}
            isHero={run.isHero}
            label={run.isHero ? `RGB BLIND ${hero.blindness_duration_s.toFixed(1)}s` : undefined}
            onClick={() => onVoidClick(run)}
          />
        ))}
      {!inWitness &&
        fils.map((f) => (
          <TrackFilament
            key={f.trackId}
            filament={f}
            frame={frame}
            durMs={durMs}
            pulses={f.isHero ? pulses : []}
            isolatedTrackId={isolatedTrackId}
            onClick={setIsolatedTrack}
          />
        ))}
      {inWitness && <WitnessScene incidents={incidents} frame={frame} />}
    </>
  );
}

function ReviewReadout({
  runs,
  incidents,
  durMs,
}: {
  runs: BlindRun[];
  incidents: Incident[];
  durMs: number;
}) {
  const reviewCursorMs = useDemoStore((s) => s.reviewCursorMs);
  const setReviewCursor = useDemoStore((s) => s.setReviewCursor);
  const tS = reviewCursorMs / 1000;
  const blind = isBlindAt(runs, tS);
  const active = useMemo(() => {
    let a: Incident | null = null;
    for (const r of incidents) {
      if (r.t_video_s * 1000 <= reviewCursorMs) a = r;
      else break;
    }
    return a;
  }, [incidents, reviewCursorMs]);

  return (
    <div className="monolith-review">
      <input
        className="ctrl-scrub"
        type="range"
        min={0}
        max={durMs}
        step={16}
        value={reviewCursorMs}
        onChange={(e) => setReviewCursor(Number(e.target.value))}
      />
      <span className="monolith-review-time">
        t={tS.toFixed(2)}s
        <span className={`monolith-flag ${blind ? "blind" : "seen"}`}>{blind ? "RGB BLIND" : "RGB OK"}</span>
        {active && <span className={`monolith-flag sev-${active.severity}`}>{active.severity}</span>}
      </span>
    </div>
  );
}

function Act3Missing({ message, clipId }: { message: string; clipId: string }) {
  return (
    <div className="storm storm-error">
      <div className="storm-error-box">
        <span className="banner-tag">ACT III DATA MISSING</span>
        <p>{message}</p>
        <p>
          Act III renders real events (app/public/clips/{clipId.replace(/^clip_/, "")}.events.bin) and the
          measured blind windows in contracts/fixtures/{clipId}.json. There is no synthetic fallback by
          design — nothing here is keyed by hand.
        </p>
        <a href="?">back to the storm</a>
      </div>
    </div>
  );
}
